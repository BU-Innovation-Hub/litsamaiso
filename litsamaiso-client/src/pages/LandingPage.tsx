import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const heroVideoUrl =
  'https://res.cloudinary.com/joelics-arts/video/upload/v1781684213/litsamaiso/landing-page-video_agw7fr.mp4';

const LandingPage = () => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-primary-clr">
      <section className="relative mx-auto min-h-screen max-w-full overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={heroVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-primary-clr via-primary-clr/70 to-transparent" />

        <div className="relative z-10 mx-auto max-w-7xl gap-12 px-4 py-28 text-white md:px-8">
          <div className="mx-auto max-w-3xl space-y-5 text-center leading-5">
            <h1 className="group mx-auto mt-5 w-fit rounded-3xl border-2 border-white/15 bg-white/10 px-5 py-2 text-sm text-white/80 backdrop-blur">
              Empowering student services
              <ArrowRight className="ml-2 inline h-4 w-4 duration-300 group-hover:translate-x-1" />
            </h1>

            <h2 className="mx-auto bg-[linear-gradient(180deg,#FFF_0%,rgba(255,255,255,0.72)_202.08%)] bg-clip-text text-4xl text-transparent md:text-6xl">
              Making academic support easier for{' '}
              <span className="bg-linear-to-r from-purple-200 to-orange-100 bg-clip-text text-transparent">
                students and institutions.
              </span>
            </h2>

            <p className="mx-auto max-w-2xl text-white/80">
              Litsamaiso helps students manage funding confirmations, upload
              bank info, and track their sponsorship status, all in one place.
            </p>

            <div className="items-center justify-center space-y-3 gap-x-3 sm:flex sm:space-y-0">
              <span className="relative inline-block overflow-hidden rounded-full p-[1.5px]">
                <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
                <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-gray-950 text-xs font-medium text-gray-50 backdrop-blur-3xl">
                  <Link
                    to="/login"
                    className="group inline-flex w-full items-center justify-center rounded-full border bg-linear-to-tr from-zinc-300/5 via-purple-400/20 to-transparent px-10 py-4 text-center text-white transition-colors hover:bg-transparent/90 sm:w-auto"
                  >
                    Get Started
                  </Link>
                </span>
              </span>
            </div>
          </div>

          {/* <div className="mx-4 mt-24 md:mx-10 md:mt-32">
            <img
              src="/hero-img.webp"
              alt="Litsamaiso platform preview"
              className="w-full rounded-lg border border-white/10 shadow-2xl shadow-black/40"
            />
          </div> */}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
