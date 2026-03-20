import { Button } from '@react-email/components';

interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
}

/**
 * CTA button matching the Cuetation amber accent colour.
 */
export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Button href={href} style={button}>
      {children}
    </Button>
  );
}

const button: React.CSSProperties = {
  backgroundColor: '#BF5700',
  color: '#141416',
  fontSize: '14px',
  fontFamily: '"DM Mono", monospace',
  fontWeight: 500,
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
};
