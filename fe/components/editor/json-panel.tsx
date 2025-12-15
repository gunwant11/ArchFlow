'use client';

import Editor from "@monaco-editor/react";

interface JsonPanelProps {
  json: any;
}

export function JsonPanel({ json }: JsonPanelProps) {
  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="json"
        theme="vs-dark"
        value={JSON.stringify(json, null, 2)}
        options={{ 
          readOnly: true, 
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
      />
    </div>
  );
}

