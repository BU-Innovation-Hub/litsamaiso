import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  Landmark,
  LockKeyhole,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { DotPattern } from "@/components/ui/dot-pattern";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { InteractiveGridPattern } from "@/components/ui/interactive-grid-pattern";
import { Marquee } from "@/components/ui/marquee";
import { Meteors } from "@/components/ui/meteors";
import { OrbitingCircles } from "@/components/ui/orbiting-circles";
import { Ripple } from "@/components/ui/ripple";
import {
  ScrollVelocityContainer,
  ScrollVelocityRow,
} from "@/components/ui/scroll-based-velocity";
import { cn } from "@/lib/utils";

const heroVideoUrl =
  "https://res.cloudinary.com/joelics-arts/video/upload/v1781684213/litsamaiso/landing-page-video_agw7fr.mp4";

const trustMetrics = [
  { value: "24/7", label: "student status visibility" },
  { value: "3x", label: "faster confirmation reviews" },
  { value: "100%", label: "auditable funding workflows" },
  { value: "1", label: "shared source of truth" },
];

const trustSignals = [
  "Student services",
  "Finance offices",
  "SRC operations",
  "Bursary teams",
  "Campus administrators",
  "Support desks",
];

const capabilityCards = [
  {
    title: "Confirmation command center",
    description:
      "Coordinate account confirmations, pending reviews, and exception handling from one operational surface.",
    icon: ClipboardCheck,
    className: "lg:col-span-2 lg:row-span-2",
    visual: "dashboard",
  },
  {
    title: "Verified uploads",
    description:
      "Collect student banking documents with clear status tracking and safer handoffs.",
    icon: UploadCloud,
    visual: "upload",
  },
  {
    title: "Role-aware access",
    description:
      "Give every team the right view across students, institutions, accounts, and issues.",
    icon: LockKeyhole,
    visual: "roles",
  },
  {
    title: "Issue resolution loops",
    description:
      "Keep conversations, context, and follow-up actions connected to every student record.",
    icon: MessageSquareText,
    className: "lg:col-span-2",
    visual: "support",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Collect",
    description:
      "Students submit details, documents, and requests through guided flows.",
    icon: UploadCloud,
  },
  {
    step: "02",
    title: "Review",
    description:
      "Teams validate submissions, resolve issues, and keep ownership visible.",
    icon: FileCheck2,
  },
  {
    step: "03",
    title: "Confirm",
    description:
      "Approved records move into reliable funding, reporting, and communication workflows.",
    icon: BadgeCheck,
  },
];

const intelligenceCards = [
  {
    title: "Operational analytics",
    description:
      "Understand bottlenecks, turnaround time, and student demand before queues become painful.",
    icon: BarChart3,
    visual: "ripple",
  },
  {
    title: "Automated oversight",
    description:
      "Surface stale submissions, incomplete records, and priority cases without manual chasing.",
    icon: Sparkles,
    visual: "meteors",
  },
  {
    title: "Institution-wide workflows",
    description:
      "Connect finance, student support, and governance teams around consistent records.",
    icon: Network,
    visual: "orbit",
  },
];

const teamMembers = [
  {
    name: "Kananelo Joel",
    role: "Product Manager",
    description:
      "Shapes the student-service experience around clarity, trust, and institutional accountability.",
    image: "/team/joel.jpg",
  },
  {
    name: "Poloko Nkolanyane",
    role: "Technical Lead",
    description:
      "Turns complex funding and governance rules into dependable, quiet infrastructure.",
    image: "/team/poloko.jpg",
  },
  {
    name: "Bokang Mahlaka",
    role: "Frontend Lead",
    description:
      "Keeps the platform grounded in the daily reality of students, admins, and support teams.",
    image: "/team/bokang.jpg",
  },
  {
    name: "Rethabile Lebelo",
    role: "Backend Dev",
    description:
      "Guides rollouts, training, and adoption so every office has a shared way forward.",
    image: "/team/belo.webp",
  },
];

const footerLinks = [
  "Platform",
  "Confirmations",
  "Institutions",
  "Support",
  "Security",
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm font-semibold uppercase text-active-clr">{children}</p>
);

const SectionHeading = ({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "center" | "left";
}) => (
  <div
    className={cn(
      "space-y-4",
      align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl",
    )}
  >
    <SectionLabel>{eyebrow}</SectionLabel>
    <h2 className="text-3xl font-semibold text-white md:text-5xl">{title}</h2>
    <p className="text-base leading-7 text-white/68 md:text-lg">
      {description}
    </p>
  </div>
);

const NavLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <a
    href={href}
    className="rounded-full px-3 py-2 text-sm font-medium text-white/72 transition hover:bg-white/10 hover:text-white"
  >
    {children}
  </a>
);

const LandingPage = () => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-primary-clr text-white">
      <section
        id="hero"
        className="relative min-h-screen overflow-hidden border-b border-white/10"
      >
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={heroVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-primary-clr/72" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(83,91,192,0.24),transparent_34%),linear-gradient(180deg,rgba(2,6,24,0.24)_0%,#020618_96%)]" />
        <InteractiveGridPattern
          width={72}
          height={72}
          squares={[28, 16]}
          className="opacity-[0.055]"
          squaresClassName="stroke-white/35"
        />

        <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/10 backdrop-blur-md">
              <img src="/logo-1.png" alt="" className="h-6 w-6" />
            </span>
            <span className="text-lg font-semibold">Litsamaiso</span>
          </Link>

          <div className="hidden items-center rounded-full border border-white/12 bg-white/8 p-1 shadow-2xl shadow-black/20 backdrop-blur-xl md:flex">
            <NavLink href="#capabilities">Capabilities</NavLink>
            <NavLink href="#workflow">Workflow</NavLink>
            <NavLink href="#intelligence">Intelligence</NavLink>
            <NavLink href="#team">Team</NavLink>
          </div>

          <div className="flex items-center gap-2">
            <AnimatedThemeToggler
              aria-label="Toggle theme"
              variant="circle"
              className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/76 backdrop-blur-xl transition hover:bg-white/14 hover:text-white sm:flex [&_svg]:h-4 [&_svg]:w-4"
            />
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white px-5 py-2.5 text-sm font-semibold text-primary-clr shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-white/90"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-96px)] max-w-7xl flex-col justify-center px-5 pb-16 pt-10 md:px-8">
          <motion.div
            className="mx-auto max-w-4xl text-center"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <div className="mx-auto mb-7 inline-flex sm:hidden items-center gap-2 rounded-full border border-white/14 bg-white/10 px-4 py-2 text-sm text-white/82 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-active-clr shadow-[0_0_22px_rgba(83,91,192,0.9)]" />
              Student services, funding confirmations, and governance in one
              place
            </div>

            <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[1.02] text-white md:text-7xl">
              Make academic support feel connected, and accountable.
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-white/74 md:text-xl">
              Litsamaiso helps institutions manage student funding
              confirmations, bank details, issues, elections, and operational
              visibility through one trusted platform.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/login"
                className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-primary-clr shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:bg-white/90 sm:w-auto"
              >
                Get started
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#capabilities"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 px-7 py-3 text-sm font-semibold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/12 sm:w-auto"
              >
                Explore platform
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          <motion.div
            className="mx-auto mt-14 grid w-full max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.18, ease: "easeOut" }}
          >
            {trustMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-white/12 bg-white/8 p-4 text-left shadow-2xl shadow-black/15 backdrop-blur-xl"
              >
                <p className="text-2xl font-semibold text-white">
                  {metric.value}
                </p>
                <p className="mt-1 text-sm leading-5 text-white/64">
                  {metric.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <main>
        <section className="relative overflow-hidden py-10">
          <DotPattern
            width={28}
            height={28}
            cr={0.6}
            className="opacity-[0.08]"
          />
          <div className="relative mx-auto max-w-7xl px-5 md:px-8">
            <div className="mb-5 flex items-center justify-between gap-6">
              <p className="text-sm font-medium text-white/54">
                Built around the offices that keep students moving
              </p>
              <div className="hidden h-px flex-1 bg-white/10 md:block" />
            </div>
            <Marquee
              pauseOnHover
              repeat={3}
              className="[--duration:34s] [--gap:1rem]"
            >
              {trustSignals.map((signal) => (
                <div
                  key={signal}
                  className="flex min-w-56 items-center gap-3 rounded-full border border-white/10 bg-white/6 px-5 py-3 text-sm font-medium text-white/72"
                >
                  <CheckCircle2 className="h-4 w-4 text-active-clr" />
                  {signal}
                </div>
              ))}
            </Marquee>
          </div>
        </section>

        <section
          id="capabilities"
          className="relative overflow-hidden py-24 md:py-32"
        >
          <InteractiveGridPattern
            width={96}
            height={96}
            squares={[18, 12]}
            className="opacity-[0.035]"
            squaresClassName="stroke-white/30"
          />
          <div className="relative mx-auto max-w-7xl px-5 md:px-8">
            <SectionHeading
              eyebrow="Product capabilities"
              title="A complete operating layer for student support."
              description="Every module is designed to reduce uncertainty: what was submitted, who reviewed it, what still needs attention, and what happens next."
            />

            <div className="mt-14 grid auto-rows-[minmax(250px,auto)] gap-4 lg:grid-cols-4">
              {capabilityCards.map((card) => {
                const Icon = card.icon;

                return (
                  <motion.article
                    key={card.title}
                    className={cn(
                      "group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5.5 p-6 shadow-2xl shadow-black/18 transition duration-300 hover:-translate-y-1 hover:border-white/18 hover:bg-white/7.5",
                      card.className,
                    )}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={fadeUp}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(83,91,192,0.22),transparent_34%)] opacity-0 transition group-hover:opacity-100" />
                    <div className="relative flex h-full flex-col justify-between gap-8">
                      <div>
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white">
                          <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mt-5 text-xl font-semibold text-white">
                          {card.title}
                        </h3>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-white/62">
                          {card.description}
                        </p>
                      </div>

                      <CapabilityVisual type={card.visual} />
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="workflow" className="relative overflow-hidden py-24">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <SectionHeading
                eyebrow="How it works"
                title="From student submission to institutional confidence."
                description="The journey is simple enough for students and structured enough for the teams responsible for funding, support, and governance."
                align="left"
              />

              <div className="relative grid gap-4 md:grid-cols-3">
                <div className="absolute left-1/2 top-14 hidden h-px w-[70%] -translate-x-1/2 bg-linear-to-r from-transparent via-active-clr/60 to-transparent md:block" />
                {workflowSteps.map((item) => {
                  const Icon = item.icon;

                  return (
                    <motion.div
                      key={item.title}
                      className="relative rounded-3xl border border-white/10 bg-white/5.5 p-6 shadow-xl shadow-black/10"
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: "-80px" }}
                      variants={fadeUp}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                    >
                      <div className="mb-8 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/42">
                          {item.step}
                        </span>
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-primary-clr text-active-clr">
                          <Icon className="h-5 w-5" />
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-white/62">
                        {item.description}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section
          id="intelligence"
          className="relative overflow-hidden border-y border-white/10 py-24 md:py-32"
        >
          <FlickeringGrid
            squareSize={3}
            gridGap={18}
            flickerChance={0.08}
            color="rgb(145,157,194)"
            maxOpacity={0.12}
            className="absolute inset-0 opacity-45"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(83,91,192,0.22),transparent_30%),linear-gradient(180deg,#020618_0%,rgba(2,6,24,0.82)_50%,#020618_100%)]" />
          <div className="relative mx-auto max-w-7xl px-5 md:px-8">
            <SectionHeading
              eyebrow="Platform intelligence"
              title="Automation and insight without operational noise."
              description="Litsamaiso gives teams the signals they need to act earlier, communicate better, and make high-volume student workflows easier to govern."
            />

            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              {intelligenceCards.map((card) => {
                const Icon = card.icon;

                return (
                  <motion.article
                    key={card.title}
                    className="relative min-h-97.5 overflow-hidden rounded-3xl border border-white/10 bg-white/5.5 p-6 shadow-2xl shadow-black/20"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={fadeUp}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                  >
                    {card.visual === "ripple" && (
                      <Ripple
                        mainCircleSize={190}
                        mainCircleOpacity={0.14}
                        numCircles={5}
                        className="opacity-35"
                      />
                    )}
                    {card.visual === "meteors" && (
                      <Meteors
                        number={5}
                        minDelay={1.4}
                        maxDelay={8}
                        minDuration={8}
                        maxDuration={14}
                        className="bg-white/50"
                      />
                    )}
                    {card.visual === "orbit" && <EcosystemOrbit />}

                    <div className="relative z-10 flex h-full flex-col justify-between gap-10">
                      <div>
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-active-clr">
                          <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mt-5 text-2xl font-semibold">
                          {card.title}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-white/64">
                          {card.description}
                        </p>
                      </div>
                      <IntelligenceVisual type={card.visual} />
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <ScrollVelocityContainer className="border-b border-white/10 py-8">
          <ScrollVelocityRow
            baseVelocity={1.6}
            className="text-4xl font-semibold text-white/5.5 md:text-6xl"
          >
            <span className="mx-6">
              confirmations / accounts / issues / elections / reporting /
            </span>
          </ScrollVelocityRow>
        </ScrollVelocityContainer>

        <section id="team" className="relative overflow-hidden py-24 md:py-32">
          <DotPattern
            width={34}
            height={34}
            cr={0.55}
            className="opacity-[0.055]"
          />
          <div className="relative mx-auto max-w-7xl px-5 md:px-8">
            <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <SectionLabel>The team</SectionLabel>
                <h2 className="mt-4 max-w-2xl text-4xl font-semibold text-white md:text-5xl">
                  Meet the minds keeping student operations human.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-white/64">
                  A focused group of product, engineering, and operations
                  specialists building a platform institutions can trust.
                </p>
              </div>
              <Link
                to="/login"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Work with us
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <TeamPhoto member={teamMembers[0]} className="lg:row-span-2" />
              <TeamBio member={teamMembers[1]} />
              <TeamPhoto member={teamMembers[2]} />
              <TeamBio member={teamMembers[3]} />
              <TeamPhoto member={teamMembers[1]} />
              <TeamBio member={teamMembers[0]} />
              <TeamPhoto member={teamMembers[3]} className="lg:row-span-2" />
              <TeamBio member={teamMembers[2]} />
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden py-24">
          <DotPattern
            width={30}
            height={30}
            cr={0.7}
            glow
            className="opacity-[0.055]"
          />
          <div className="relative mx-auto max-w-5xl px-5 text-center md:px-8">
            <div className="rounded-4xl border border-white/10 bg-white/5.5 px-6 py-14 shadow-2xl shadow-black/20 md:px-12">
              <SectionLabel>Ready when your institution is</SectionLabel>
              <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold text-white md:text-6xl">
                Bring every student support workflow into one trusted system.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/66 md:text-lg">
                Start with confirmations, expand into issues, elections, and
                institution-wide reporting as your operational needs mature.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/login"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-primary-clr transition hover:-translate-y-0.5 hover:bg-white/90"
                >
                  Launch workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-primary-clr px-7 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/8"
                >
                  View workflow
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black/18 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/10">
                <img src="/logo-1.png" alt="" className="h-6 w-6" />
              </span>
              <span className="text-lg font-semibold">Litsamaiso</span>
            </Link>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/54">
              Academic support, confirmations, and student operations made
              clearer for every team involved.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {footerLinks.map((item) => (
              <a
                key={item}
                href="#hero"
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/58 transition hover:bg-white/8 hover:text-white"
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

const CapabilityVisual = ({ type }: { type: string }) => {
  if (type === "dashboard") {
    return (
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-primary-clr/70 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/46">
            Review queue
          </span>
          <span className="rounded-full bg-active-clr/20 px-2 py-1 text-xs text-white/72">
            Live
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {["Confirmed", "Pending", "Issues"].map((label, index) => (
            <div key={label} className="rounded-xl bg-white/8 p-3">
              <div className="h-2 w-12 rounded-full bg-white/18" />
              <div
                className={cn(
                  "mt-4 h-10 rounded-lg",
                  index === 0 && "bg-active-clr/70",
                  index === 1 && "bg-stroke-clr/35",
                  index === 2 && "bg-orange-200/55",
                )}
              />
              <p className="mt-3 text-xs text-white/54">{label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "support") {
    return (
      <div className="space-y-3">
        {["Student submitted new statement", "Finance requested review"].map(
          (item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-primary-clr/60 p-3"
            >
              <div className="h-9 w-9 rounded-full bg-white/10" />
              <div>
                <div className="h-2 w-36 rounded-full bg-white/22" />
                <p className="mt-2 text-xs text-white/52">{item}</p>
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <div className="flex h-28 items-end gap-2 rounded-2xl border border-white/10 bg-primary-clr/60 p-4">
      {[42, 66, 50, 84, 58, 72].map((height, index) => (
        <div
          key={`${height}-${index}`}
          className="flex-1 rounded-t-xl bg-linear-to-t from-active-clr/20 to-white/45"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
};

const EcosystemOrbit = () => (
  <div className="absolute bottom-8 right-8 h-40 w-40 opacity-75">
    <OrbitingCircles radius={58} duration={24} iconSize={28}>
      <Landmark className="h-4 w-4 text-white/72" />
      <UsersRound className="h-4 w-4 text-white/72" />
      <ShieldCheck className="h-4 w-4 text-white/72" />
    </OrbitingCircles>
  </div>
);

const IntelligenceVisual = ({ type }: { type: string }) => {
  if (type === "orbit") {
    return (
      <div className="grid grid-cols-3 gap-2 text-center text-xs text-white/54">
        {["Finance", "Support", "Governance"].map((item) => (
          <span key={item} className="rounded-full bg-white/8 px-3 py-2">
            {item}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {["Submissions", "Review time", "Resolution rate"].map((item, index) => (
        <div key={item}>
          <div className="mb-2 flex justify-between text-xs text-white/50">
            <span>{item}</span>
            <span>{[82, 64, 91][index]}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-linear-to-r from-active-clr to-white/70"
              style={{ width: `${[82, 64, 91][index]}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const TeamPhoto = ({
  member,
  className,
}: {
  member: (typeof teamMembers)[number];
  className?: string;
}) => (
  <motion.figure
    className={cn(
      "relative min-h-72 overflow-hidden rounded-3xl border border-white/10 bg-white/5.5",
      className,
    )}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-80px" }}
    variants={fadeUp}
    transition={{ duration: 0.55, ease: "easeOut" }}
  >
    <img
      src={member.image}
      alt={member.name}
      className="absolute inset-0 h-full w-full object-cover opacity-88 grayscale-10"
    />
    <div className="absolute inset-0 bg-linear-to-t from-primary-clr via-primary-clr/24 to-transparent" />
    <figcaption className="absolute inset-x-0 bottom-0 p-5">
      <p className="text-sm font-semibold text-white">{member.name}</p>
      <p className="mt-1 text-xs uppercase text-white/58">{member.role}</p>
    </figcaption>
  </motion.figure>
);

const TeamBio = ({ member }: { member: (typeof teamMembers)[number] }) => (
  <motion.article
    className="min-h-44 rounded-3xl border border-white/10 bg-white/5.5 p-5 shadow-xl shadow-black/10"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-80px" }}
    variants={fadeUp}
    transition={{ duration: 0.55, ease: "easeOut" }}
  >
    <p className="text-xs font-semibold uppercase text-active-clr">
      {member.role}
    </p>
    <h3 className="mt-8 text-base font-semibold text-white">{member.name}</h3>
    <p className="mt-3 text-sm leading-6 text-white/62">{member.description}</p>
  </motion.article>
);

export default LandingPage;
