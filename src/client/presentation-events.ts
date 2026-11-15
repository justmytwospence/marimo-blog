export type OutputStatus = { state: 'ready' | 'error'; message?: string };
export type OutputStatusEvent = CustomEvent<OutputStatus>;

/** Package-local DOM status only; never bridged to or from window messages. */
export function emitOutputStatus(element: HTMLElement, status: OutputStatus): void {
  element.dispatchEvent(new CustomEvent<OutputStatus>('mb:output-status', {
    bubbles: true,
    detail: { state: status.state, ...(status.message === undefined ? {} : { message: status.message }) },
  }));
}
