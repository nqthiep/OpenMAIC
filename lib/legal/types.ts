/** A legal text as data: the page draws it, and the same data can be tested. */

export type LegalBlock =
  | { readonly type: 'p'; readonly text: string }
  | { readonly type: 'ul'; readonly items: readonly string[] }
  | { readonly type: 'ol'; readonly items: readonly string[] }
  | {
      readonly type: 'table';
      readonly head: readonly string[];
      readonly rows: readonly string[][];
    };

export interface LegalSection {
  /** Anchor of the section, unique in the document. */
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalDocument {
  readonly title: string;
  /** One sentence under the title: what the text is for. */
  readonly summary: string;
  readonly sections: readonly LegalSection[];
}

/** What a text needs to name the service, its operator and where to write. */
export interface LegalContext {
  readonly product: string;
  readonly domain: string;
  readonly email: string;
  /** The version stamp of the texts (`TERMS_VERSION`). */
  readonly version: string;
}

/** The words of the page around the text, in the language of the text. */
export interface LegalChrome {
  readonly updated: string;
  readonly contents: string;
  readonly draft: string;
  readonly other: string;
  readonly back: string;
}
