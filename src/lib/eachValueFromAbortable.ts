import { Observable, fromEvent, takeUntil } from 'rxjs';
import { eachValueFrom } from 'rxjs-for-await';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function* eachValueFromAbortable<O extends Observable<any>>(
  observable: O,
  signal: AbortSignal | undefined,
): AsyncIterable<O extends Observable<infer D> ? D : never> {
  let safe$: O;

  if (signal) {
    const abort$ = fromEvent(signal, 'abort');

    safe$ = observable.pipe(takeUntil(abort$)) as O;
  } else {
    safe$ = observable;
  }

  for await (const value of eachValueFrom(safe$)) {
    yield value;
  }
}
