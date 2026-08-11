export const isUnsubscribeEmail = (email: string): boolean => {
  const isUnsubscribePattern =
    /unsubscribe|opt[.\-_]?out|(^|[@.\-_+])unsub([@.\-_+]|$)/;

  return isUnsubscribePattern.test(email.toLowerCase());
};
