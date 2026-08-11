import { ConnectedAccountRefreshAccessTokenException } from 'src/engine/metadata-modules/connected-account/exceptions/connected-account-refresh-tokens.exception';
import { TwentyORMException } from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { CALDAV_AUTH_ERROR_MESSAGE_PREFIXES } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-auth-error-message-prefixes.constant';
import { CALDAV_CALLER_ERROR_MESSAGE_PATTERN } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-caller-error-message-pattern.constant';
import { CALDAV_DISCOVERY_ERROR_MESSAGE_PATTERN } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-discovery-error-message-pattern.constant';
import { CALDAV_HTTP_ERROR_MESSAGE_PREFIXES } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-http-error-message-prefixes.constant';
import { CALDAV_HTTP_STATUS_PATTERN } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-http-status-pattern.constant';
import {
  CalendarEventImportDriverException,
  CalendarEventImportDriverExceptionCode,
} from 'src/modules/calendar/calendar-event-import-manager/drivers/exceptions/calendar-event-import-driver.exception';

type ClassifiedException =
  | CalendarEventImportDriverException
  | ConnectedAccountRefreshAccessTokenException
  | TwentyORMException;

const buildException = (
  message: string,
  code: CalendarEventImportDriverExceptionCode,
): CalendarEventImportDriverException =>
  new CalendarEventImportDriverException(message, code);

const parseCalDAVHttpStatusError = (
  message: string,
): CalendarEventImportDriverException => {
  const status = Number(message.match(CALDAV_HTTP_STATUS_PATTERN)?.[1]);

  switch (status) {
    case 401:
    case 403:
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS,
      );

    case 404:
    case 410:
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.NOT_FOUND,
      );

    case 408:
    case 429:
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR,
      );

    default:
      return buildException(
        message,
        status >= 500
          ? CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR
          : CalendarEventImportDriverExceptionCode.UNKNOWN,
      );
  }
};

export const parseCalDAVError = (error: unknown): ClassifiedException => {
  if (
    error instanceof CalendarEventImportDriverException ||
    error instanceof ConnectedAccountRefreshAccessTokenException ||
    error instanceof TwentyORMException
  ) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : `Unknown CalDAV error: ${error}`;

  if (
    CALDAV_HTTP_ERROR_MESSAGE_PREFIXES.some((prefix) =>
      message.startsWith(prefix),
    )
  ) {
    return parseCalDAVHttpStatusError(message);
  }

  if (
    CALDAV_AUTH_ERROR_MESSAGE_PREFIXES.some((prefix) =>
      message.startsWith(prefix),
    )
  ) {
    return buildException(
      message,
      CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS,
    );
  }

  if (CALDAV_CALLER_ERROR_MESSAGE_PATTERN.test(message)) {
    return buildException(
      message,
      CalendarEventImportDriverExceptionCode.CHANNEL_MISCONFIGURED,
    );
  }

  if (CALDAV_DISCOVERY_ERROR_MESSAGE_PATTERN.test(message)) {
    return buildException(
      message,
      CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR,
    );
  }

  switch (message) {
    case 'Invalid auth method':
    case 'Basic auth header was not encoded correctly':
    case "authMethod 'Custom' requires an authFunction to produce request headers":
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS,
      );

    case 'Collection does not exist on server':
    case 'Calendar object to delete was not found':
    case 'Calendar object to update was not found':
    case 'Created calendar object was not found':
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.NOT_FOUND,
      );

    case 'cannot find principalUrl':
    case 'cannot find homeUrl':
    case 'cannot find calendarUserAddresses':
    case 'no account for fetchCalendars':
    case 'no account for fetchAddressBooks':
    case 'no account for smartCollectionSync':
    case 'Must have account before syncCalendars':
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR,
      );

    case 'cannot fetchCalendarObjects for undefined calendar':
    case 'cannot fetchVCards for undefined addressBook':
    case 'collection.fetchObjects is required for basic sync changes':
    case 'collection.objectMultiGet is required for webdav sync changes':
    case 'timeRange is required':
    case 'invalid timeRange format, not in ISO8601':
    case 'invalid timeRange: start must be before end':
    case 'invalid timeRange: start or end is not a valid date':
    case 'freeBusyQuery returned no response':
    case 'DAVClient not exported from built ESM bundle':
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.CHANNEL_MISCONFIGURED,
      );

    default:
      return buildException(
        message,
        CalendarEventImportDriverExceptionCode.UNKNOWN,
      );
  }
};
