import { cn } from "@/lib/utils";

type BrandLogoMarkProps = {
  alt?: string;
  className?: string;
  imageClassName?: string;
};

export function BrandLogoMark({ alt = "", className, imageClassName }: BrandLogoMarkProps) {
  return (
    <div className={cn("h-10 w-10 shrink-0 overflow-hidden", className)}>
      <img src="/brand/conductor-placeholder.png" alt={alt} className={cn("h-full w-full object-contain", imageClassName)} />
    </div>
  );
}
