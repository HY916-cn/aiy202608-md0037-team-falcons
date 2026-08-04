export type LoadableState<T> =
  | { readonly status: 'loading' }
  | { readonly data: T; readonly status: 'empty' | 'ready' }
  | { readonly error: unknown; readonly status: 'error' };

export type ResolvedLoadableState<T> = Exclude<
  LoadableState<T>,
  { readonly status: 'loading' }
>;

export const LOADING_STATE = { status: 'loading' } as const satisfies LoadableState<never>;

export async function resolveLoadableState<T>(
  load: () => Promise<T>,
  isEmpty: (data: T) => boolean,
): Promise<ResolvedLoadableState<T>> {
  try {
    const data = await load();
    return { data, status: isEmpty(data) ? 'empty' : 'ready' };
  } catch (error) {
    return { error, status: 'error' };
  }
}
