import { proxy } from "valtio";

export type WorldClockEntry = {
  id: string;
  timeZone: string;
  label: string;
};

export const worldClockStore = proxy({
  clocks: [] as WorldClockEntry[],
});
