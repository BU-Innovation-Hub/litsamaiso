import { useId, useMemo, useState } from "react";
import { Play } from "lucide-react";
import posterImage from "@/assets/vid-poster.webp";
import { cn } from "@/lib/utils";

const defaultEmbedUrl =
  "https://player.cloudinary.com/embed/?cloud_name=joelics-arts&public_id=litsamaiso%2FLitsamaiso_Explainer_Cut_2_cfecpf";

type ExplainerVideoProps = {
  className?: string;
  embedUrl?: string;
  posterSrc?: string;
  title?: string;
};

export const ExplainerVideo = ({
  className,
  embedUrl = defaultEmbedUrl,
  posterSrc = posterImage,
  title = "Litsamaiso explainer video",
}: ExplainerVideoProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const headingId = useId();
  const autoplayUrl = useMemo(
    () => `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=true`,
    [embedUrl],
  );

  return (
    <section
      className={cn(
        "relative overflow-hidden bg-white py-12 sm:py-16 lg:py-20",
        className,
      )}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="sr-only">
        Product explainer video
      </h2>

      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="relative rounded-[2rem] bg-linear-to-b from-white to-gray-100 p-2 shadow-[0_28px_80px_-40px_rgba(2,6,24,0.55)] ring-1 ring-gray-200/80 sm:p-3">
          <div className="relative aspect-video overflow-hidden rounded-[1.5rem] bg-primary-clr">
            {isPlaying ? (
              <iframe
                title={title}
                src={autoplayUrl}
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <>
                <img
                  src={posterSrc}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-primary-clr/42" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.14),transparent_34%)]" />

                <button
                  type="button"
                  aria-label="Play Litsamaiso explainer video"
                  onClick={() => setIsPlaying(true)}
                  className="group absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-primary-clr shadow-[0_18px_45px_-18px_rgba(2,6,24,0.8)] ring-1 ring-white/70 transition duration-300 hover:scale-110 hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-active/40 sm:h-20 sm:w-20"
                >
                  <span className="absolute inset-0 rounded-full bg-white/35 opacity-0 transition duration-300 group-hover:scale-125 group-hover:opacity-100" />
                  <Play
                    className="relative ml-1 h-7 w-7 fill-current transition duration-300 group-hover:scale-105 sm:h-9 sm:w-9"
                    aria-hidden="true"
                  />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
