import { useState, useRef, useEffect, useCallback } from 'react';

interface SearchableDropdownProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** 'contains' (default) matches anywhere; 'prefix' matches from the start */
  filterMode?: 'contains' | 'prefix';
}

export function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  autoFocus = false,
  filterMode = 'contains',
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter((opt) =>
    filterMode === 'prefix'
      ? opt.toLowerCase().startsWith(searchText.toLowerCase())
      : opt.toLowerCase().includes(searchText.toLowerCase()),
  );

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Reset search text to current value display
        setSearchText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, isOpen]);

  const selectOption = useCallback(
    (opt: string) => {
      onChange(opt);
      setSearchText('');
      setIsOpen(false);
      setHighlightIndex(0);
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (filtered[highlightIndex]) {
          selectOption(filtered[highlightIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setSearchText('');
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchText('');
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    setHighlightIndex(0);
    if (!isOpen) setIsOpen(true);
  };

  const handleFocus = () => {
    setIsOpen(true);
    setSearchText('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? searchText : value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={value || placeholder}
        className="w-full rounded px-2 py-1.5 text-xs outline-none"
        style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', caretColor: 'var(--amber)' }}
      />
      {isOpen && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md shadow-lg max-h-48 overflow-y-auto annotation-scroll"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-hi)' }}
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${opt === value ? 'font-semibold' : ''}`}
              style={{
                background: i === highlightIndex ? 'var(--amber)' : undefined,
                color: i === highlightIndex ? 'white' : 'var(--text)',
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md shadow-lg px-3 py-2 text-xs" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-hi)', color: 'var(--text-dim)' }}>
          No matches
        </div>
      )}
    </div>
  );
}
