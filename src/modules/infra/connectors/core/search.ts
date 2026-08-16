import type { BulkIndexResult } from 'typings/general.ts'

import { RestClient } from './rest.ts'

/**
 * Abstract base class for connectors that integrate with search/indexing engines
 * (Elasticsearch, OpenSearch, and similar).
 *
 * This class extends {@link RestClient} rather than {@link ZanixConnector} directly: unlike
 * database or cache backends, search engines in this category are consumed over HTTP, so the
 * request/response handling `RestClient` already provides is reused instead of reimplemented —
 * the same reasoning `GraphQLClient` already follows.
 *
 * Extend this class to create custom search connector implementations for your indexing backend.
 *
 * @abstract
 * @extends RestClient
 */
export abstract class ZanixSearchConnector extends RestClient {
  /**
   * Indexes a single document.
   *
   * @param doc - The document to index.
   * @param opts - Per-call options (e.g. a target index overriding the connector's default).
   */
  public abstract index(
    doc: Record<string, unknown>,
    opts?: { index?: string },
  ): Promise<void>

  /**
   * Indexes multiple documents in a single batch request.
   *
   * @param docs - The documents to index.
   * @param opts - Per-call options (e.g. a target index overriding the connector's default).
   * @returns Whether any document failed and how many, even on an otherwise-successful request.
   */
  public abstract bulkIndex(
    docs: Record<string, unknown>[],
    opts?: { index?: string },
  ): Promise<BulkIndexResult>
}
