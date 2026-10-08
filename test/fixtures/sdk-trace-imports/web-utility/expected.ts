import { TracerProvider } from '@opentelemetry/sdk-trace';
import { getElementXPath } from '@opentelemetry/sdk-trace-web';

const provider = new TracerProvider();
getElementXPath(document.body);
