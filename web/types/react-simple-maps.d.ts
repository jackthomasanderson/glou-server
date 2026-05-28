declare module 'react-simple-maps' {
  import * as React from 'react';

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: {
      scale?: number;
      center?: [number, number];
      rotate?: [number, number, number];
      parallels?: [number, number];
    };
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  interface GeographiesProps {
    geography: string | object;
    children: (args: { geographies: Geography[] }) => React.ReactNode;
  }

  interface Geography {
    rsmKey: string;
    type: string;
    properties: Record<string, unknown>;
    geometry: object;
  }

  interface GeographyProps {
    geography: Geography;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
    onClick?: (geo: Geography) => void;
    onMouseEnter?: (geo: Geography) => void;
    onMouseLeave?: () => void;
    key?: string | number;
  }

  interface MarkerProps {
    coordinates: [number, number];
    children?: React.ReactNode;
    onClick?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
  }

  interface ZoomableGroupProps {
    zoom?: number;
    center?: [number, number];
    minZoom?: number;
    maxZoom?: number;
    children?: React.ReactNode;
    onMoveStart?: () => void;
    onMoveEnd?: () => void;
  }

  export const ComposableMap: React.FC<ComposableMapProps>;
  export const Geographies: React.FC<GeographiesProps>;
  export const Geography: React.FC<GeographyProps>;
  export const Marker: React.FC<MarkerProps>;
  export const ZoomableGroup: React.FC<ZoomableGroupProps>;
  export const Sphere: React.FC<{ id?: string; fill?: string; stroke?: string; strokeWidth?: number }>;
  export const Graticule: React.FC<{ id?: string; stroke?: string; strokeWidth?: number }>;
}
