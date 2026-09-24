/* Unthrottled tick source for the pomodoro engine: dedicated-worker timers keep firing on
   schedule even when the tab is hidden or backgrounded, unlike main-thread setInterval. */
self.setInterval(() => {
  self.postMessage("tick");
}, 1000);
