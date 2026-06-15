declare module "@react-email/components" {
  // Minimal declarations for the components used in templates
  import React = require("react");
  export const Html: React.ComponentType<any>;
  export const Head: React.ComponentType<any>;
  export const Body: React.ComponentType<any>;
  export const Container: React.ComponentType<any>;
  export const Section: React.ComponentType<any>;
  export const Row: React.ComponentType<any>;
  export const Column: React.ComponentType<any>;
  export const Img: React.ComponentType<any>;
  export const Hr: React.ComponentType<any>;
  export const Text: React.ComponentType<any>;
  export const Link: React.ComponentType<any>;
  export const Button: React.ComponentType<any>;
  export const Preview: React.ComponentType<any>;
}

declare module "@react-email/render" {
  import React = require("react");
  export function render(element: React.ReactElement): string;
}
