import { memo, useEffect, useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { Copy, Check } from 'lucide-react';

interface MarkdownProps {
  content: string;
  className?: string;
}

const SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'tsx',
  'json',
  'bash',
  'python',
  'yaml',
  'sql',
]);

function normalizeLanguage(language: string): string {
  const lang = language.trim().toLowerCase();
  switch (lang) {
    case 'js':
      return 'javascript';
    case 'ts':
      return 'typescript';
    case 'sh':
    case 'shell':
      return 'bash';
    case 'yml':
      return 'yaml';
    default:
      return lang;
  }
}

type LoadedSyntaxHighlighter = {
  SyntaxHighlighter: React.ComponentType<Record<string, unknown>> & {
    registerLanguage?: (name: string, language: unknown) => void;
  };
  style: unknown;
};

let cachedSyntaxHighlighter: LoadedSyntaxHighlighter | null = null;
let cachedSyntaxHighlighterPromise: Promise<LoadedSyntaxHighlighter> | null = null;

async function loadSyntaxHighlighter(): Promise<LoadedSyntaxHighlighter> {
  if (cachedSyntaxHighlighter) {
    return cachedSyntaxHighlighter;
  }

  if (!cachedSyntaxHighlighterPromise) {
    cachedSyntaxHighlighterPromise = Promise.all([
      import('react-syntax-highlighter/dist/esm/prism-light'),
      import('react-syntax-highlighter/dist/esm/styles/prism'),
      // Register only a small set of languages to keep the bundle lean.
      import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
      import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
      import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
      import('react-syntax-highlighter/dist/esm/languages/prism/json'),
      import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
      import('react-syntax-highlighter/dist/esm/languages/prism/python'),
      import('react-syntax-highlighter/dist/esm/languages/prism/yaml'),
      import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
    ]).then(
      ([
        syntaxModule,
        styleModule,
        javascriptModule,
        typescriptModule,
        tsxModule,
        jsonModule,
        bashModule,
        pythonModule,
        yamlModule,
        sqlModule,
      ]) => {
        const SyntaxHighlighter = (syntaxModule as unknown as { default?: unknown }).default;
        const style = (styleModule as unknown as { oneDark?: unknown }).oneDark;

        if (!SyntaxHighlighter || !style) {
          throw new Error('Syntax highlighter modules failed to load');
        }

        const languages = [
          { name: 'javascript', mod: javascriptModule },
          { name: 'typescript', mod: typescriptModule },
          { name: 'tsx', mod: tsxModule },
          { name: 'json', mod: jsonModule },
          { name: 'bash', mod: bashModule },
          { name: 'python', mod: pythonModule },
          { name: 'yaml', mod: yamlModule },
          { name: 'sql', mod: sqlModule },
        ] as const;

        for (const entry of languages) {
          const language = (entry.mod as unknown as { default?: unknown }).default;
          if (!language) continue;

          const register = (SyntaxHighlighter as LoadedSyntaxHighlighter['SyntaxHighlighter'])
            .registerLanguage;
          if (typeof register === 'function') {
            register(entry.name, language);
          }
        }

        cachedSyntaxHighlighter = {
          SyntaxHighlighter: SyntaxHighlighter as LoadedSyntaxHighlighter['SyntaxHighlighter'],
          style,
        };

        return cachedSyntaxHighlighter;
      }
    );
  }

  return cachedSyntaxHighlighterPromise;
}

function CodeBlock({
  inline,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [highlighter, setHighlighter] = useState<LoadedSyntaxHighlighter | null>(
    cachedSyntaxHighlighter
  );
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const normalizedLanguage = normalizeLanguage(language);
  const code = String(children).replace(/\n$/, '');
  const SyntaxHighlighterComponent = highlighter?.SyntaxHighlighter ?? null;
  const shouldHighlight = Boolean(
    SyntaxHighlighterComponent && normalizedLanguage && SUPPORTED_LANGUAGES.has(normalizedLanguage)
  );

  useEffect(() => {
    if (inline) return;
    let cancelled = false;

    void loadSyntaxHighlighter()
      .then((loaded) => {
        if (!cancelled) {
          setHighlighter(loaded);
        }
      })
      .catch(() => {
        // If the highlighter fails to load, we still render plain text code blocks.
      });

    return () => {
      cancelled = true;
    };
  }, [inline]);

  const handleCopy = () => {
    if (!navigator.clipboard?.writeText) {
      return;
    }
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  if (inline) {
    return (
      <code
        className="px-1.5 py-0.5 bg-gray-800/80 border border-gray-700/50 rounded text-sm font-mono text-brand-300"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="relative group my-3">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
        <button
          onClick={handleCopy}
          className={clsx(
            'p-1.5 rounded transition-all duration-200',
            copied
              ? 'bg-green-900/40 text-green-400 shadow-sm shadow-green-500/10'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white hover:scale-105'
          )}
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      {language && (
        <div className="absolute left-3 top-0 -translate-y-1/2 px-2 py-0.5 bg-gray-700/90 border border-gray-600/50 rounded text-xs text-gray-400 z-10 font-mono">
          {language}
        </div>
      )}
      {shouldHighlight && SyntaxHighlighterComponent ? (
        <SyntaxHighlighterComponent
          style={highlighter!.style}
          language={normalizedLanguage}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            padding: '1rem',
            paddingTop: language ? '1.5rem' : '1rem',
          }}
        >
          {code}
        </SyntaxHighlighterComponent>
      ) : (
        <pre className="bg-gray-950/60 border border-gray-800 rounded-lg overflow-auto max-h-96 p-4 text-sm">
          <code className="font-mono text-gray-200 whitespace-pre">{code}</code>
        </pre>
      )}
    </div>
  );
}

// Type-safe wrapper for react-markdown v10+
type MarkdownComponent = React.ComponentType<{
  children: string;
  remarkPlugins?: unknown[];
  components?: Record<string, unknown>;
}>;

const MarkdownRenderer = ReactMarkdown as unknown as MarkdownComponent;

export const Markdown = memo(function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      <MarkdownRenderer
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:text-brand-300 underline"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote className="border-l-4 border-brand-500/40 pl-4 italic text-gray-400 bg-slate-800/20 py-2 pr-3 rounded-r-lg">
              {children}
            </blockquote>
          ),
          table: ({ children }: { children?: React.ReactNode }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-slate-700/50 shadow-sm">
              <table className="min-w-full divide-y divide-slate-700/50">{children}</table>
            </div>
          ),
          thead: ({ children }: { children?: React.ReactNode }) => (
            <thead className="bg-slate-800/60">{children}</thead>
          ),
          th: ({ children }: { children?: React.ReactNode }) => (
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }: { children?: React.ReactNode }) => (
            <td className="px-3 py-2 text-sm text-gray-300 border-t border-slate-700/50">
              {children}
            </td>
          ),
          ul: ({ children }: { children?: React.ReactNode }) => (
            <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
          ),
          ol: ({ children }: { children?: React.ReactNode }) => (
            <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
          ),
          li: ({ children }: { children?: React.ReactNode }) => (
            <li className="text-gray-300">{children}</li>
          ),
          h1: ({ children }: { children?: React.ReactNode }) => (
            <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }: { children?: React.ReactNode }) => (
            <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }: { children?: React.ReactNode }) => (
            <h3 className="text-base font-bold mt-3 mb-1">{children}</h3>
          ),
          hr: () => <hr className="border-slate-700/50 my-4" />,
          p: ({ children }: { children?: React.ReactNode }) => (
            <p className="my-2 leading-relaxed">{children}</p>
          ),
          strong: ({ children }: { children?: React.ReactNode }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          em: ({ children }: { children?: React.ReactNode }) => (
            <em className="italic text-gray-300">{children}</em>
          ),
        }}
      >
        {content}
      </MarkdownRenderer>
    </div>
  );
});
