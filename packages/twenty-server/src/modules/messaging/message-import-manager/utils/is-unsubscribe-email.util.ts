export const isUnsubscribeEmail = (email: string): boolean => {
  const isUnsubscribePattern =
    /(?<![a-z])(unsubscribe|unsub|opt[.\-_]?out)(?![a-z])/;

  return isUnsubscribePattern.test(email.toLowerCase());
};
