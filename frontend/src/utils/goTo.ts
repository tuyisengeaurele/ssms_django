/** Go to another address with a normal page load. A function of its own so a test can watch where it goes. */
export function goTo(address: string): void {
  window.location.assign(address);
}
