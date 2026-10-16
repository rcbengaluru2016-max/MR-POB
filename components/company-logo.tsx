import Image from "next/image";

export function CompanyLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-block aspect-[1499/1049] w-36 shrink-0 sm:w-44 ${className}`}>
      <Image
        src="/zenex-international-logo.png"
        alt="Zenex International"
        fill
        priority
        sizes="(max-width: 640px) 144px, 176px"
        className="object-contain"
      />
    </span>
  );
}
