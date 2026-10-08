import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

class AppProvider extends NodeTracerProvider {
  register() {
    console.log('registering');
    super.register();
  }
}

const provider = new AppProvider();
provider.register();
