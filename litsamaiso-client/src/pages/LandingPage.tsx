import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
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
import { DotPattern } from "@/components/ui/dot-pattern";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { InteractiveGridPattern } from "@/components/ui/interactive-grid-pattern";
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
    image: "/team/joel.webp",
  },
  {
    name: "Poloko Nkolanyane",
    role: "Technical Lead",
    description:
      "Turns complex funding and governance rules into dependable, quiet infrastructure.",
    image: "/team/poloko.webp",
  },
  {
    name: "Bokang Mahlaka",
    role: "Frontend Lead",
    description:
      "Keeps the platform grounded in the daily reality of students, admins, and support teams.",
    image: "/team/bokang.webp",
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
    <h2 className="text-3xl font-semibold text-primary-clr md:text-5xl">{title}</h2>
    <p className="text-base leading-7 text-gray-600 md:text-lg">
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
    className="rounded-full px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-primary-clr"
  >
    {children}
  </a>
);

const LandingPage = () => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gray-50">
        <section
          id="hero"
          className="relative min-h-screen overflow-hidden border-b border-gray-200"
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
        <div className="absolute inset-0 bg-white/60" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(83,91,192,0.06),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.5)_0%,white_96%)]" />
        <InteractiveGridPattern
          width={72}
          height={72}
          squares={[28, 16]}
          className="opacity-[0.06]"
          squaresClassName="stroke-gray-300"
        />

        <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-100">
              <img src="/logo-1.png" alt="" className="h-6 w-6" />
            </span>
            <span className="text-lg font-semibold text-primary-clr">Litsamaiso</span>
          </Link>

          <div className="hidden items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm md:flex">
            <NavLink href="#capabilities">Capabilities</NavLink>
            <NavLink href="#workflow">Workflow</NavLink>
            <NavLink href="#intelligence">Intelligence</NavLink>
            <NavLink href="#team">Team</NavLink>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-primary-clr px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-clr/90"
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
            <div className="mx-auto mb-7 inline-flex sm:hidden items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-active-clr shadow-[0_0_22px_rgba(83,91,192,0.9)]" />
              Student services, funding confirmations, and governance in one
              place
            </div>

            <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[1.02] text-primary-clr md:text-7xl">
              Make academic support feel connected, and accountable.
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-gray-600 md:text-xl">
              Litsamaiso helps institutions manage student funding
              confirmations, bank details, issues, elections, and operational
              visibility through one trusted platform.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/login"
                className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-clr px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-clr/90 sm:w-auto"
              >
                Get started
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#capabilities"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-7 py-3 text-sm font-semibold text-primary-clr shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50 sm:w-auto"
              >
                Explore platform
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <main>
        <section
          id="capabilities"
          className="relative overflow-hidden py-24 md:py-32"
        >
          <InteractiveGridPattern
            width={96}
            height={96}
            squares={[18, 12]}
            className="opacity-[0.06]"
            squaresClassName="stroke-gray-300"
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
                      "group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-gray-300 hover:shadow-md",
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
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-gray-100 text-primary-clr">
                          <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mt-5 text-xl font-semibold text-primary-clr">
                          {card.title}
                        </h3>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-gray-600">
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
                      className="relative rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: "-80px" }}
                      variants={fadeUp}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                    >
                      <div className="mb-8 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-400">
                          {item.step}
                        </span>
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-active-clr">
                          <Icon className="h-5 w-5" />
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold text-primary-clr">
                        {item.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-gray-600">
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
          className="relative overflow-hidden border-y border-gray-200 py-24 md:py-32"
        >
          <FlickeringGrid
            squareSize={3}
            gridGap={18}
            flickerChance={0.08}
            color="rgb(145,157,194)"
            maxOpacity={0.12}
            className="absolute inset-0 opacity-45"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(83,91,192,0.08),transparent_30%),linear-gradient(180deg,white_0%,rgba(255,255,255,0)_50%,white_100%)]" />
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
                    className="relative min-h-97.5 overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
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
                        className="bg-active-clr/40"
                      />
                    )}
                    {card.visual === "orbit" && <EcosystemOrbit />}

                    <div className="relative z-10 flex h-full flex-col justify-between gap-10">
                      <div>
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-gray-100 text-active-clr">
                          <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mt-5 text-2xl font-semibold text-primary-clr">
                          {card.title}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-gray-600">
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

        <ScrollVelocityContainer className="border-b border-gray-200 py-8">
          <ScrollVelocityRow
            baseVelocity={1.6}
            className="text-4xl font-semibold text-gray-200 md:text-6xl"
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
                <h2 className="mt-4 max-w-2xl text-4xl font-semibold text-primary-clr md:text-5xl">
                  Meet the minds keeping student operations human.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
                  A focused group of product, engineering, and operations
                  specialists building a platform institutions can trust.
                </p>
              </div>
              <Link
                to="/login"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-primary-clr shadow-sm transition hover:bg-gray-50"
              >
                Work with us
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <TeamPhoto
                member={teamMembers[0]}
                className="order-1 md:order-1 lg:order-0 lg:row-span-2"
              />
              <TeamBio
                member={teamMembers[1]}
                className="order-3 md:order-2 lg:order-0"
              />
              <TeamPhoto
                member={teamMembers[2]}
                className="order-5 md:order-5 lg:order-0"
              />
              <TeamBio
                member={teamMembers[3]}
                className="order-7 md:order-6 lg:order-0"
              />
              <TeamPhoto
                member={teamMembers[1]}
                className="order-4 md:order-4 lg:order-0"
              />
              <TeamBio
                member={teamMembers[2]}
                className="order-6 md:order-7 lg:order-0"
              />
              <TeamPhoto
                member={teamMembers[3]}
                className="order-8 md:order-8 lg:order-0 lg:row-span-2"
              />
              <TeamBio
                member={teamMembers[0]}
                className="order-2 md:order-3 lg:order-0"
              />
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
            <div className="rounded-4xl border border-gray-200 bg-white px-6 py-14 shadow-md md:px-12">
              <SectionLabel>Ready when your institution is</SectionLabel>
              <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold text-primary-clr md:text-6xl">
                Bring every student support workflow into one trusted system.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">
                Start with confirmations, expand into issues, elections, and
                institution-wide reporting as your operational needs mature.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/login"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary-clr px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-clr/90"
                >
                  Launch workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-7 py-3 text-sm font-semibold text-primary-clr shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50"
                >
                  View workflow
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-gray-100 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-200">
                <img src="/logo-1.png" alt="" className="h-6 w-6" />
              </span>
              <span className="text-lg font-semibold text-primary-clr">Litsamaiso</span>
            </Link>
            <p className="mt-3 max-w-md text-sm leading-6 text-gray-500">
              Academic support, confirmations, and student operations made
              clearer for every team involved.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {footerLinks.map((item) => (
              <a
                key={item}
                href="#hero"
                className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
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
      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-100 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">
            Review queue
          </span>
          <span className="rounded-full bg-active-clr/20 px-2 py-1 text-xs text-gray-600">
            Live
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {["Confirmed", "Pending", "Issues"].map((label, index) => (
            <div key={label} className="rounded-xl bg-white p-3">
              <div className="h-2 w-12 rounded-full bg-gray-200" />
              <div
                className={cn(
                  "mt-4 h-10 rounded-lg",
                  index === 0 && "bg-active-clr/70",
                  index === 1 && "bg-stroke-clr/35",
                  index === 2 && "bg-orange-200/55",
                )}
              />
              <p className="mt-3 text-xs text-gray-500">{label}</p>
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
              className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-100 p-3"
            >
              <div className="h-9 w-9 rounded-full bg-gray-200" />
              <div>
                <div className="h-2 w-36 rounded-full bg-gray-200" />
                <p className="mt-2 text-xs text-gray-600">{item}</p>
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <div className="flex h-28 items-end gap-2 rounded-2xl border border-gray-200 bg-gray-100 p-4">
      {[42, 66, 50, 84, 58, 72].map((height, index) => (
        <div
          key={`${height}-${index}`}
          className="flex-1 rounded-t-xl bg-linear-to-t from-active-clr/20 to-active-clr/10"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
};

const EcosystemOrbit = () => (
  <div className="absolute bottom-8 right-8 h-40 w-40 opacity-75">
    <OrbitingCircles radius={58} duration={24} iconSize={28}>
      <Landmark className="h-4 w-4 text-active-clr" />
      <UsersRound className="h-4 w-4 text-active-clr" />
      <ShieldCheck className="h-4 w-4 text-active-clr" />
    </OrbitingCircles>
  </div>
);

const IntelligenceVisual = ({ type }: { type: string }) => {
  if (type === "orbit") {
    return (
      <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
        {["Finance", "Support", "Governance"].map((item) => (
          <span key={item} className="rounded-full bg-gray-100 px-3 py-2">
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
          <div className="mb-2 flex justify-between text-xs text-gray-500">
            <span>{item}</span>
            <span>{[82, 64, 91][index]}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-linear-to-r from-active-clr to-active-clr/40"
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
      "relative min-h-72 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm",
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
    <div className="absolute inset-0 bg-linear-to-t from-gray-900/70 via-gray-900/20 to-transparent" />
    <figcaption className="absolute inset-x-0 bottom-0 p-5">
      <p className="text-sm font-semibold text-white">{member.name}</p>
      <p className="mt-1 text-xs uppercase text-white/58">{member.role}</p>
    </figcaption>
  </motion.figure>
);

const TeamBio = ({
  member,
  className,
}: {
  member: (typeof teamMembers)[number];
  className?: string;
}) => (
  <motion.article
    className={cn(
      "min-h-44 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm",
      className,
    )}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-80px" }}
    variants={fadeUp}
    transition={{ duration: 0.55, ease: "easeOut" }}
  >
    <p className="text-xs font-semibold uppercase text-active-clr">
      {member.role}
    </p>
    <h3 className="mt-8 text-base font-semibold text-primary-clr">{member.name}</h3>
    <p className="mt-3 text-sm leading-6 text-gray-600">{member.description}</p>
  </motion.article>
);

export default LandingPage;
