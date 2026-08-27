import type { ReactNode } from 'react';
import './ui';

declare module './ui' {
  /**
   * Transitional compatibility for legacy clinical timeline chips.
   * `pine` and `slate` are already used by RecordScreen and map to
   * neutral/institutional visual semantics in the existing stylesheet.
   */
  export function Tag(props: {
    children: ReactNode;
    tone: 'warn' | 'info' | 'moss' | 'mute' | 'danger' | 'pine' | 'slate';
  }): JSX.Element;
}
