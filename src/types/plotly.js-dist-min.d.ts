declare module 'plotly.js-dist-min' {
  import type * as Plotly from 'plotly.js';
  /** The distribution can be exposed as an ESM namespace or as a CJS default. */
  const plotly: Pick<typeof Plotly, 'newPlot' | 'react' | 'addFrames' | 'deleteFrames' | 'purge' | 'Plots'>;
  export = plotly;
}
