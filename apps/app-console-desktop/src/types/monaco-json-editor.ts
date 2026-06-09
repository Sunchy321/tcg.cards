/** Methods exposed by the Monaco JSON editor component. */
export interface MonacoJsonEditorRef {
  formatDocument: () => Promise<void>;
}

/** Validation payload emitted by the Monaco JSON editor component. */
export interface MonacoJsonEditorValidation {
  hasErrors: boolean;
  messages: string[];
}
