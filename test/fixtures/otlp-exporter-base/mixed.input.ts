import { type OTLPExporterNodeConfigBase as Options, CompressionAlgorithm as Compression, type OTLPExporterConfigBase } from '@opentelemetry/otlp-exporter-base';
const options: Options = { compression: Compression.GZIP };
const shared: OTLPExporterConfigBase = options;
