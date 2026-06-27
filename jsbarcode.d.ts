/**
 * Type declaration for jsbarcode (no official @types/jsbarcode package exists).
 * JsBarcode supports SVGElement, HTMLCanvasElement, and CSS selector strings as targets.
 */
declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    displayValue?: boolean;
    text?: string;
    fontOptions?: string;
    font?: string;
    textAlign?: string;
    textPosition?: string;
    textMargin?: number;
    fontSize?: number;
    background?: string;
    lineColor?: string;
    margin?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    valid?: (valid: boolean) => void;
  }

  function JsBarcode(
    target: SVGElement | HTMLCanvasElement | string,
    value: string,
    options?: JsBarcodeOptions
  ): void;

  export = JsBarcode;
}
