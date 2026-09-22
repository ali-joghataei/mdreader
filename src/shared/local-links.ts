// Only explicit filesystem URLs/drive paths; never allow arbitrary protocols.
export const isExplicitLocalFileLink = (href: string) =>
  !Array.from(href).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
  /^(?:[a-z]:[\\/]|file:\/\/)/i.test(href);
