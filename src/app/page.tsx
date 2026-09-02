import Navbar from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/sections/hero";
import TrustSection from "@/components/landing/sections/trust-section";
import Features from "@/components/landing/sections/features";
import ProductShowcase from "@/components/landing/sections/product-showcase";
import HowItWorks from "@/components/landing/sections/how-it-works";
import BusinessBenefits from "@/components/landing/sections/business-benefits";
import WorkflowTimeline from "@/components/landing/sections/workflow-timeline";
import Testimonials from "@/components/landing/sections/testimonials";
import BusinessAccess from "@/components/landing/sections/business-access";
import FAQ from "@/components/landing/sections/faq";
import FinalCTA from "@/components/landing/sections/final-cta";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-[var(--text-primary)]" dir="rtl">
      <Navbar />
      <main>
        <Hero />
        <TrustSection />
        <Features />
        <ProductShowcase />
        <HowItWorks />
        <BusinessBenefits />
        <WorkflowTimeline />
        <Testimonials />
        <BusinessAccess />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
