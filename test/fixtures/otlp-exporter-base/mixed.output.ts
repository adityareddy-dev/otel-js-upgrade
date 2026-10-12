import { type OTLPExporterNodeConfigBase as Options } from '@opentelemetry/otlp-exporter-base/node-http';
import { CompressionAlgorithm as Compression, type OTLPExporterConfigBase } from '@opentelemetry/otlp-exporter-base';
const options: Options = { compression: Compression.GZIP };
const shared: OTLPExporterConfigBase = options;
