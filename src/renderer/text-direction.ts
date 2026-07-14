const rtlCharacterPattern = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const ltrCharacterPattern = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;

export function getTextDirection(text: string) {
  let rtlCount = 0;
  let ltrCount = 0;
  const sample = text.replace(/https?:\/\/\S+|\S+@\S+/g, '').slice(0, 400);
  let firstStrongDirection: 'rtl' | 'ltr' | null = null;

  for (const character of sample) {
    if (rtlCharacterPattern.test(character)) {
      rtlCount += 1;
      firstStrongDirection ??= 'rtl';
      continue;
    }

    if (ltrCharacterPattern.test(character)) {
      ltrCount += 1;
      firstStrongDirection ??= 'ltr';
    }
  }

  if (rtlCount === 0 && ltrCount === 0) {
    return null;
  }

  if (rtlCount >= 2 && (firstStrongDirection === 'rtl' || ltrCount <= rtlCount * 4)) {
    return 'rtl';
  }

  if (ltrCount > rtlCount) {
    return 'ltr';
  }

  return null;
}

