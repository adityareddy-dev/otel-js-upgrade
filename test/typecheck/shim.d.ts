// Names the guide's before and after blocks use without declaring them, and the test globals the mock cases call.
declare const exporter: any
declare const jest: any
declare const vi: any
interface Window {
  ENV: any
}
// What an untyped package exports: callable with type arguments, constructible, any property.
interface AnyValue {
  <A = any, B = any, C = any>(...args: any[]): any
  new (...args: any[]): any
  [key: string]: any
}
