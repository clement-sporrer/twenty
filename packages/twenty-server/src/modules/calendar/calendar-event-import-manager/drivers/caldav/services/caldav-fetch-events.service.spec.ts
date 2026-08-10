import { type DAVClient } from 'tsdav';

import { CalDavFetchEventsService } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/services/caldav-fetch-events.service';
import { CalendarEventImportDriverExceptionCode } from 'src/modules/calendar/calendar-event-import-manager/drivers/exceptions/calendar-event-import-driver.exception';

const SERVER_URL = 'https://caldav.example.com';
const PRIMARY_URL = `${SERVER_URL}/calendars/user/primary/`;
const PERSONAL_URL = `${SERVER_URL}/calendars/user/personal/`;
const HREF_A = `${PRIMARY_URL}event-a.ics`;
const HREF_B = `${PRIMARY_URL}event-b.ics`;

const buildICal = (uid: string, dtStart = '20260601T100000Z') =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${uid}`,
    `DTSTART:${dtStart}`,
    'DTEND:20260601T110000Z',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

const buildClient = () => {
  const fetchCalendars = jest.fn();
  const syncCollection = jest.fn();
  const davRequest = jest.fn();
  const propfind = jest.fn();

  return {
    client: {
      serverUrl: SERVER_URL,
      fetchCalendars,
      syncCollection,
      davRequest,
      propfind,
    } as unknown as DAVClient,
    fetchCalendars,
    syncCollection,
    davRequest,
    propfind,
  };
};

describe('CalDavFetchEventsService', () => {
  let service: CalDavFetchEventsService;

  beforeEach(() => {
    service = new CalDavFetchEventsService();
  });

  describe('fetchChangedEventHrefs', () => {
    it('collects changed hrefs from sync-collection and ctag/etag calendars without fetching bodies', async () => {
      const c = buildClient();

      c.fetchCalendars.mockResolvedValue([
        {
          url: PRIMARY_URL,
          components: ['VEVENT'],
          reports: ['syncCollection'],
        },
        { url: PERSONAL_URL, components: ['VEVENT'], reports: [], ctag: 'c-1' },
      ]);
      c.syncCollection.mockResolvedValue([
        { href: HREF_A, status: 207, ok: true, props: {} },
      ]);
      c.propfind.mockResolvedValue([
        { href: HREF_B, status: 207, ok: true, props: { getetag: '"etag-b"' } },
      ]);

      const result = await service.fetchChangedEventHrefs(c.client);

      expect(result.changedHrefs.sort()).toEqual([HREF_A, HREF_B].sort());
      expect(result.cancelledHrefs).toEqual([]);
      expect(c.davRequest).not.toHaveBeenCalled();
    });

    it('separates cancelled (404) hrefs from changed ones in a sync-collection delta', async () => {
      const c = buildClient();

      c.fetchCalendars.mockResolvedValue([
        {
          url: PRIMARY_URL,
          components: ['VEVENT'],
          reports: ['syncCollection'],
        },
      ]);
      c.syncCollection.mockResolvedValue([
        { href: HREF_A, status: 207, ok: true, props: {} },
        { href: HREF_B, status: 404, ok: false, props: {} },
      ]);

      const result = await service.fetchChangedEventHrefs(c.client, {
        syncTokens: { [PRIMARY_URL]: 'token-prior' },
      });

      expect(result.changedHrefs).toEqual([HREF_A]);
      expect(result.cancelledHrefs).toEqual([HREF_B]);
    });

    it('skips network when the server CTag matches the stored CTag', async () => {
      const c = buildClient();

      c.fetchCalendars.mockResolvedValue([
        {
          url: PRIMARY_URL,
          components: ['VEVENT'],
          reports: [],
          ctag: 'unchanged',
        },
      ]);

      const storedEtags = { [HREF_A]: '"etag-a"' };

      const result = await service.fetchChangedEventHrefs(c.client, {
        syncTokens: {},
        ctags: { [PRIMARY_URL]: 'unchanged' },
        etags: { [PRIMARY_URL]: storedEtags },
      });

      expect(result.changedHrefs).toEqual([]);
      expect(c.propfind).not.toHaveBeenCalled();
      expect(result.syncCursor.etags).toEqual({ [PRIMARY_URL]: storedEtags });
    });

    it('separates changed from vanished hrefs in an etag diff', async () => {
      const c = buildClient();

      c.fetchCalendars.mockResolvedValue([
        {
          url: PRIMARY_URL,
          components: ['VEVENT'],
          reports: [],
          ctag: 'new-ctag',
        },
      ]);
      c.propfind.mockResolvedValue([
        {
          href: HREF_A,
          status: 207,
          ok: true,
          props: { getetag: '"etag-a-updated"' },
        },
      ]);

      const result = await service.fetchChangedEventHrefs(c.client, {
        syncTokens: {},
        ctags: { [PRIMARY_URL]: 'old-ctag' },
        etags: {
          [PRIMARY_URL]: { [HREF_A]: '"etag-a"', [HREF_B]: '"etag-b"' },
        },
      });

      expect(result.changedHrefs).toEqual([HREF_A]);
      expect(result.cancelledHrefs).toEqual([HREF_B]);
    });

    it('preserves the prior cursor entry for a calendar whose sync fails', async () => {
      const c = buildClient();

      c.fetchCalendars.mockResolvedValue([
        {
          url: PRIMARY_URL,
          components: ['VEVENT'],
          reports: ['syncCollection'],
        },
      ]);
      c.syncCollection.mockRejectedValue(new Error('network blip'));

      const result = await service.fetchChangedEventHrefs(c.client, {
        syncTokens: { [PRIMARY_URL]: 'token-prior' },
      });

      expect(result.changedHrefs).toEqual([]);
      expect(result.cancelledHrefs).toEqual([]);
      expect(result.syncCursor.syncTokens[PRIMARY_URL]).toBe('token-prior');
    });

    it('keeps a numeric sync-token so the next run is a delta and not a full listing', async () => {
      const c = buildClient();

      c.fetchCalendars.mockResolvedValue([
        {
          url: PRIMARY_URL,
          components: ['VEVENT'],
          reports: ['syncCollection'],
        },
      ]);
      c.syncCollection.mockResolvedValue([
        {
          href: HREF_A,
          status: 207,
          ok: true,
          props: {},
          raw: { multistatus: { syncToken: 1786321680 } },
        },
      ]);

      const result = await service.fetchChangedEventHrefs(c.client);

      expect(result.syncCursor.syncTokens[PRIMARY_URL]).toBe('1786321680');
    });

    it('omits the sync-token on the first run so the server returns a full listing', async () => {
      const c = buildClient();

      c.fetchCalendars.mockResolvedValue([
        {
          url: PRIMARY_URL,
          components: ['VEVENT'],
          reports: ['syncCollection'],
        },
      ]);
      c.syncCollection.mockResolvedValue([
        { href: HREF_A, status: 207, ok: true, props: {} },
      ]);

      await service.fetchChangedEventHrefs(c.client);

      expect(c.syncCollection).toHaveBeenCalledWith(
        expect.not.objectContaining({ syncToken: expect.anything() }),
      );
    });
  });

  describe('fetchEventsByHrefs', () => {
    it('fetches bodies for the given hrefs grouped by calendar collection', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        {
          href: HREF_A,
          status: 200,
          ok: true,
          props: { calendarData: buildICal('uid-a') },
        },
      ]);

      const events = await service.fetchEventsByHrefs(c.client, [HREF_A]);

      expect(c.davRequest).toHaveBeenCalledWith(
        expect.objectContaining({ url: PRIMARY_URL }),
      );
      expect(events.map((event) => event.iCalUid)).toEqual(['uid-a']);
    });

    it('drops events that fall outside the import time window', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        {
          href: HREF_A,
          status: 200,
          ok: true,
          props: { calendarData: buildICal('uid-a', '20990101T100000Z') },
        },
      ]);

      const events = await service.fetchEventsByHrefs(c.client, [HREF_A]);

      expect(events).toEqual([]);
    });

    it('keeps importing the batch when a member href was deleted server-side', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        {
          href: HREF_B,
          status: 404,
          statusText: 'Not Found',
          ok: false,
          props: {},
        },
        {
          href: HREF_A,
          status: 200,
          ok: true,
          props: { calendarData: buildICal('uid-a') },
        },
      ]);

      const events = await service.fetchEventsByHrefs(c.client, [
        HREF_A,
        HREF_B,
      ]);

      expect(events.map((event) => event.iCalUid)).toEqual(['uid-a']);
    });

    it('keeps importing the batch when a deleted member carries no props at all', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        { href: HREF_B, status: 404, statusText: 'Not Found', ok: false },
        {
          href: HREF_A,
          status: 200,
          ok: true,
          props: { calendarData: buildICal('uid-a') },
        },
      ]);

      const events = await service.fetchEventsByHrefs(c.client, [
        HREF_A,
        HREF_B,
      ]);

      expect(events.map((event) => event.iCalUid)).toEqual(['uid-a']);
    });

    it('skips a member the server refuses without failing the whole batch', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        { href: HREF_B, status: 403, statusText: 'Forbidden', ok: false },
        {
          href: HREF_A,
          status: 200,
          ok: true,
          props: { calendarData: buildICal('uid-a') },
        },
      ]);

      const events = await service.fetchEventsByHrefs(c.client, [
        HREF_A,
        HREF_B,
      ]);

      expect(events.map((event) => event.iCalUid)).toEqual(['uid-a']);
    });

    it('surfaces an insufficient permissions exception when the whole request is refused', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        {
          href: PRIMARY_URL,
          status: 401,
          statusText: 'Unauthorized',
          ok: false,
          raw: '<error/>',
        },
      ]);

      await expect(
        service.fetchEventsByHrefs(c.client, [HREF_A]),
      ).rejects.toMatchObject({
        code: CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS,
      });
    });

    it('still recognises the collection when the server omits its trailing slash', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        {
          href: PRIMARY_URL.replace(/\/$/, ''),
          status: 401,
          statusText: 'Unauthorized',
          ok: false,
          raw: '<error/>',
        },
      ]);

      await expect(
        service.fetchEventsByHrefs(c.client, [HREF_A]),
      ).rejects.toMatchObject({
        code: CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS,
      });
    });

    it('surfaces a not found driver exception when the collection itself is gone', async () => {
      const c = buildClient();

      c.davRequest.mockResolvedValue([
        {
          href: PRIMARY_URL,
          status: 404,
          statusText: 'Not Found',
          ok: false,
          raw: '<error/>',
        },
      ]);

      await expect(
        service.fetchEventsByHrefs(c.client, [HREF_A]),
      ).rejects.toMatchObject({
        code: CalendarEventImportDriverExceptionCode.NOT_FOUND,
      });
    });
  });
});
