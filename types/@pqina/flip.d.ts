declare module "@pqina/flip" {
  export interface TickInstance {
    value: string;
  }
  declare const Tick: {
    DOM: {
      create: (element: HTMLElement, options: { value: string }) => TickInstance | undefined;
      /** Root element passed to `create`, not the returned instance. */
      destroy: (rootElement: HTMLElement) => void;
    };
  };
  export default Tick;
}
