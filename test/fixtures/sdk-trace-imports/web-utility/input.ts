import { WebTracerProvider, getElementXPath } from '@opentelemetry/sdk-trace-web';

const provider = new WebTracerProvider();
getElementXPath(document.body);
