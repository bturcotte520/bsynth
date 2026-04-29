import {DotStatus} from '@/components/ui/DotStatus';

type SynthContainerProps = {
  isEnabled?: boolean;
  title: string;
  children: React.ReactNode;
  meterLeft: React.ReactNode;
  meterRight: React.ReactNode;
};

export function SynthContainer({
  isEnabled = false,
  title,
  children,
  meterLeft,
  meterRight,
}: SynthContainerProps) {
  return (
    <div className='rounded-2xl bg-gray-2' style={{boxShadow: '4px 4px 12px rgba(0,0,0,0.08), -2px -2px 8px rgba(255,255,255,0.4)'}}>
      <div className='flex select-none items-center gap-2 rounded-t-2xl bg-gray-1 px-3 py-2 text-sm font-semibold uppercase tracking-wider'>
        <DotStatus status={isEnabled ? 'enabled' : 'disabled'} />
        {title}
      </div>
      <div className='flex'>
        <div className='p-3 sm:p-4'>{children}</div>
        <div className='flex w-2 gap-0.5'>
          <div className='relative flex-1'>{meterLeft}</div>
          <div className='relative flex-1'>{meterRight}</div>
        </div>
      </div>
    </div>
  );
}
