import { atom } from "jotai";

import { newId } from "./uid";

export const frontendSessionIdAtom = atom(newId.frontendSession());
