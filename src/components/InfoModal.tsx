import React from 'react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, content }) => {
  if (!isOpen) return null;

  const inlineFormat = (text: string): string => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e0e0e0">$1</strong>')
      .replace(
        /`(.+?)`/g,
        '<code style="background:#2a2a2a;padding:1px 4px;border-radius:3px;font-size:0.82em;color:#f0c674">$1</code>',
      );
  };

  const renderContent = (raw: string) => {
    const lines = raw.split('\n');
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let inList = false;
    let listItems: React.ReactNode[] = [];
    let isOrderedList = false;
    let key = 0;

    const flushTable = () => {
      if (tableHeaders.length > 0) {
        elements.push(
          <div key={key++} style={{ overflowX: 'auto', margin: '12px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {tableHeaders.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign: 'left',
                        padding: '6px 10px',
                        borderBottom: '2px solid #444',
                        color: '#f0c674',
                        fontWeight: 600,
                      }}
                    >
                      {h.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '5px 10px',
                          borderBottom: '1px solid #333',
                          color: '#ccc',
                        }}
                        dangerouslySetInnerHTML={{ __html: inlineFormat(cell.trim()) }}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    };

    const flushList = () => {
      if (listItems.length > 0) {
        const ListTag = isOrderedList ? 'ol' : 'ul';
        elements.push(
          <ListTag key={key++} style={{ margin: '8px 0', paddingLeft: '24px', color: '#ccc' }}>
            {listItems}
          </ListTag>,
        );
      }
      listItems = [];
      inList = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Table row
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        // Separator row (e.g. |---|---|)
        if (cells.every((c) => /^[\s\-:]+$/.test(c))) {
          continue;
        }
        if (!inTable) {
          if (inList) flushList();
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        continue;
      } else if (inTable) {
        flushTable();
      }

      // Ordered list items
      if (/^\d+\.\s/.test(line.trim())) {
        if (inTable) flushTable();
        if (inList && !isOrderedList) flushList();
        if (!inList) {
          inList = true;
          isOrderedList = true;
        }
        const text = line.trim().replace(/^\d+\.\s/, '');
        listItems.push(
          <li
            key={key++}
            style={{ marginBottom: '4px', lineHeight: '1.5' }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(text) }}
          />,
        );
        continue;
      }

      // Unordered list items
      if (/^[-*]\s/.test(line.trim())) {
        if (inTable) flushTable();
        if (inList && isOrderedList) flushList();
        if (!inList) {
          inList = true;
          isOrderedList = false;
        }
        const text = line.trim().replace(/^[-*]\s/, '');
        listItems.push(
          <li
            key={key++}
            style={{ marginBottom: '4px', lineHeight: '1.5' }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(text) }}
          />,
        );
        continue;
      }

      if (inList) flushList();

      // Headers
      if (line.startsWith('# ')) {
        elements.push(
          <h1
            key={key++}
            style={{
              fontSize: '1.4rem',
              color: '#f0c674',
              margin: '20px 0 8px',
              borderBottom: '1px solid #444',
              paddingBottom: '6px',
            }}
          >
            {line.replace('# ', '')}
          </h1>,
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2
            key={key++}
            style={{ fontSize: '1.15rem', color: '#e0c060', margin: '18px 0 6px' }}
          >
            {line.replace('## ', '')}
          </h2>,
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3
            key={key++}
            style={{ fontSize: '1rem', color: '#d0b050', margin: '14px 0 4px' }}
          >
            {line.replace('### ', '')}
          </h3>,
        );
      } else if (line.startsWith('> ')) {
        const text = line.replace('> ', '');
        elements.push(
          <blockquote
            key={key++}
            style={{
              borderLeft: '3px solid #f0c674',
              paddingLeft: '12px',
              margin: '8px 0',
              color: '#aaa',
              fontStyle: 'italic',
            }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(text) }}
          />,
        );
      } else if (line.startsWith('---')) {
        elements.push(
          <hr
            key={key++}
            style={{ border: 'none', borderTop: '1px solid #444', margin: '16px 0' }}
          />,
        );
      } else if (line.trim() !== '') {
        elements.push(
          <p
            key={key++}
            style={{ margin: '6px 0', color: '#ccc', lineHeight: '1.6' }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(line) }}
          />,
        );
      }
    }

    if (inTable) flushTable();
    if (inList) flushList();

    return elements;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1e1e1e',
          border: '1px solid #444',
          borderRadius: '8px',
          width: '700px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #333',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#f0c674' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {renderContent(content)}
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
