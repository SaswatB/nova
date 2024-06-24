import { customAlphabet } from "nanoid";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const nanoid = customAlphabet(alphabet, 20);

/**
 * https://stackoverflow.com/a/6573119/8481473
 */
function fromNumber(number: number) {
  if (isNaN(Number(number)) || number === null || number === Number.POSITIVE_INFINITY)
    throw new Error("The input is not valid");
  if (number < 0) throw new Error("Can't represent negative numbers");

  let rixit; // like 'digit', only in some non-decimal radix
  let residual = Math.floor(number);
  let result = "";
  while (true) {
    rixit = residual % alphabet.length;
    result = alphabet.charAt(rixit) + result;
    residual = Math.floor(residual / alphabet.length);

    if (residual == 0) break;
  }
  return result;
}

enum ID_TYPE {
  project = "p",
  graphNode = "gn",
  graphRun = "gr",
  nodeScope = "ns",
  frontendSession = "fs",
  space = "s",
  spacePage = "sp",
  traceChat = "tc",
}

/**
 * Similar to https://clerk.dev/blog/generating-sortable-stripe-like-ids-with-segment-ksuids
 * lm_183a1baffe nanoid format
 */
function uid(prefix: ID_TYPE) {
  return `${prefix}_${fromNumber(new Date().getTime()).substring(0, 6)}${nanoid()}`;
}

export const newId = (Object.keys(ID_TYPE) as (keyof typeof ID_TYPE)[]).reduce(
  (acc, key) => ({ ...acc, [key]: () => uid(ID_TYPE[key]) }),
  {} as Record<keyof typeof ID_TYPE, () => string>,
);
