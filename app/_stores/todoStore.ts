import { proxy } from "valtio";

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

export const todoStore = proxy({
  dayKey: "",
  items: [] as TodoItem[],
});
