import clsx from 'clsx';

type DotStatusProps = {
  status: 'enabled' | 'disabled' | 'error';
};

export function DotStatus({status}: DotStatusProps) {
  return (
    <div
      className={clsx(
        'h-2.5 w-2.5 rounded-full shadow-sm',
        status === 'enabled' && 'bg-green',
        status === 'disabled' && 'bg-gray-4',
        status === 'error' && 'bg-red',
      )}
    />
  );
}
