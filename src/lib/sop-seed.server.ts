// Server-only: seeds the 10 default ("starter") SOP templates into a firm.
// Idempotent — skips templates whose name already exists for the firm.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SeedStep = { description: string; estimated_hrs: number };
type SeedPhase = {
  name: string;
  expected_hrs: number;
  billable: boolean;
  triggered_by?: string;
  done_when?: string;
  steps: SeedStep[];
};
type SeedTemplate = {
  name: string;
  category: string;
  department: string;
  description: string;
  triggered_by: string;
  done_when: string;
  scope_risk_level: "low" | "medium" | "high";
  common_failure_modes: string;
  phases: SeedPhase[];
};

export const DEFAULT_SOP_TEMPLATES: SeedTemplate[] = [
  {
    name: "New Client Onboarding",
    category: "Studio Operations",
    department: "Principal / Admin",
    description:
      "The process from first inquiry to signed contract and project kickoff. Establishes expectations, documents scope, and sets the financial and communication foundation for the engagement.",
    triggered_by: "Inbound inquiry received",
    done_when: "Contract signed, deposit collected, kickoff meeting completed",
    scope_risk_level: "low",
    common_failure_modes:
      "Scope not documented before verbal yes given; deposit not collected before work begins; client expectations misaligned before contract.",
    phases: [
      {
        name: "Initial Inquiry & Qualification",
        expected_hrs: 0.75,
        billable: false,
        triggered_by: "Inquiry form or referral received",
        done_when: "Fit confirmed, discovery call scheduled",
        steps: [
          { description: "Review inquiry and assess project fit (budget, scope, location, timeline)", estimated_hrs: 0.25 },
          { description: "Send introduction email with availability and next steps", estimated_hrs: 0.25 },
          { description: "Schedule discovery call", estimated_hrs: 0.25 },
        ],
      },
      {
        name: "Discovery Call",
        expected_hrs: 1.5,
        billable: false,
        triggered_by: "Discovery call scheduled",
        done_when: "Call complete, notes documented, go/no-go decision made",
        steps: [
          { description: "Prepare call agenda and review any materials sent by prospect", estimated_hrs: 0.25 },
          { description: "Conduct discovery call — project vision, budget, timeline, decision-making process", estimated_hrs: 1.0 },
          { description: "Document call notes and key requirements", estimated_hrs: 0.25 },
        ],
      },
      {
        name: "Proposal Preparation",
        expected_hrs: 2.5,
        billable: false,
        triggered_by: "Go decision made after discovery",
        done_when: "Proposal sent to prospect",
        steps: [
          { description: "Define scope of work and deliverables", estimated_hrs: 0.75 },
          { description: "Calculate project fee and payment schedule", estimated_hrs: 0.5 },
          { description: "Draft proposal document", estimated_hrs: 0.75 },
          { description: "Internal review of proposal", estimated_hrs: 0.25 },
          { description: "Send proposal with follow-up scheduled", estimated_hrs: 0.25 },
        ],
      },
      {
        name: "Contract & Onboarding",
        expected_hrs: 2.0,
        billable: false,
        triggered_by: "Prospect verbally accepts proposal",
        done_when: "Contract signed, deposit received, client portal access granted",
        steps: [
          { description: "Send contract via e-signature platform", estimated_hrs: 0.25 },
          { description: "Collect signed contract and deposit payment", estimated_hrs: 0.25 },
          { description: "Set up client in project management and communication systems", estimated_hrs: 0.5 },
          { description: "Send welcome package and onboarding guide", estimated_hrs: 0.25 },
          { description: "Schedule kickoff meeting", estimated_hrs: 0.25 },
          { description: "Prepare kickoff agenda", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Kickoff Meeting",
        expected_hrs: 2.0,
        billable: true,
        triggered_by: "Contract signed and deposit received",
        done_when: "Kickoff meeting complete, brief document approved in writing by client",
        steps: [
          { description: "Conduct kickoff meeting — priorities, non-negotiables, aesthetic references, lifestyle requirements", estimated_hrs: 1.5 },
          { description: "Document client brief and send for written approval within 48 hours", estimated_hrs: 0.5 },
        ],
      },
    ],
  },
  {
    name: "Full Residential Renovation",
    category: "Residential",
    department: "Design",
    description:
      "End-to-end process for a full home or multi-room residential renovation from programming through installation and final reveal.",
    triggered_by: "Signed contract and deposit received",
    done_when: "Punch list complete, final invoice paid, project formally closed",
    scope_risk_level: "high",
    common_failure_modes:
      "Scope creep in sourcing; client-driven design changes after approval; contractor delays extending billable oversight; purchasing errors requiring reorders.",
    phases: [
      {
        name: "Programming & Discovery",
        expected_hrs: 6.0, billable: true,
        triggered_by: "Kickoff meeting complete, brief approved",
        done_when: "Room-by-room program documented and approved by client",
        steps: [
          { description: "Conduct site visit and field measurements", estimated_hrs: 2.0 },
          { description: "Document existing conditions with photos", estimated_hrs: 0.5 },
          { description: "Develop room-by-room program and functional requirements", estimated_hrs: 2.0 },
          { description: "Present program to client for approval", estimated_hrs: 1.0 },
          { description: "Incorporate feedback and finalize program", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Schematic Design",
        expected_hrs: 16.0, billable: true,
        triggered_by: "Program approved by client",
        done_when: "Schematic concept approved in writing by client",
        steps: [
          { description: "Develop space plans for all rooms", estimated_hrs: 5.0 },
          { description: "Develop concept direction — mood boards, material palette", estimated_hrs: 4.0 },
          { description: "Prepare schematic presentation", estimated_hrs: 3.0 },
          { description: "Present schematic design to client", estimated_hrs: 1.5 },
          { description: "Document feedback and revisions", estimated_hrs: 1.5 },
          { description: "Revise and obtain written approval", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Design Development",
        expected_hrs: 24.0, billable: true,
        triggered_by: "Schematic design approved",
        done_when: "All selections finalized and approved, specifications complete",
        steps: [
          { description: "Develop detailed floor plans and elevations for all rooms", estimated_hrs: 8.0 },
          { description: "Develop all FF&E selections — furniture, lighting, textiles, accessories", estimated_hrs: 8.0 },
          { description: "Develop finish schedule — flooring, tile, paint, hardware", estimated_hrs: 4.0 },
          { description: "Prepare design development presentation", estimated_hrs: 2.0 },
          { description: "Present to client and document feedback", estimated_hrs: 1.5 },
          { description: "Finalize all selections with written approval", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Construction Documents & Specifications",
        expected_hrs: 12.0, billable: true,
        triggered_by: "Design development approved",
        done_when: "Permit-ready drawings issued, specifications complete",
        steps: [
          { description: "Prepare construction drawings — demolition, construction, reflected ceiling plans", estimated_hrs: 6.0 },
          { description: "Prepare finish and fixture specifications", estimated_hrs: 3.0 },
          { description: "Coordinate with consultants — structural, MEP, lighting designer", estimated_hrs: 2.0 },
          { description: "Internal quality review of documents", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Procurement",
        expected_hrs: 16.0, billable: true,
        triggered_by: "Specifications complete, client approval received",
        done_when: "All items ordered, confirmed, and tracked in procurement log",
        steps: [
          { description: "Prepare procurement schedule and budget", estimated_hrs: 2.0 },
          { description: "Issue purchase orders for all items", estimated_hrs: 4.0 },
          { description: "Confirm order acknowledgments and lead times from all vendors", estimated_hrs: 2.0 },
          { description: "Set up and maintain receiving log", estimated_hrs: 1.0 },
          { description: "Coordinate delivery and storage schedule", estimated_hrs: 2.0 },
          { description: "Track all items against schedule — weekly status updates", estimated_hrs: 5.0 },
        ],
      },
      {
        name: "Construction Administration",
        expected_hrs: 20.0, billable: true,
        triggered_by: "Construction commenced",
        done_when: "Construction complete, punch list signed off",
        steps: [
          { description: "Conduct weekly site visits and document progress", estimated_hrs: 10.0 },
          { description: "Review and respond to RFIs from contractor", estimated_hrs: 3.0 },
          { description: "Review submittals and shop drawings", estimated_hrs: 3.0 },
          { description: "Manage change orders and scope changes", estimated_hrs: 2.0 },
          { description: "Prepare and distribute punch list", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "Installation & Styling",
        expected_hrs: 12.0, billable: true,
        triggered_by: "Construction complete, furniture deliveries confirmed",
        done_when: "All items installed, rooms styled, client walkthrough complete",
        steps: [
          { description: "Coordinate and oversee furniture delivery and installation", estimated_hrs: 6.0 },
          { description: "Style all rooms — art placement, accessories, textiles", estimated_hrs: 4.0 },
          { description: "Conduct final client walkthrough", estimated_hrs: 1.0 },
          { description: "Document any outstanding items and coordinate resolution", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Project Close",
        expected_hrs: 3.0, billable: true,
        triggered_by: "Client walkthrough complete",
        done_when: "Final invoice paid, project archive complete",
        steps: [
          { description: "Prepare and send final invoice", estimated_hrs: 0.5 },
          { description: "Compile and send project archive — as-built drawings, warranties, care instructions", estimated_hrs: 1.5 },
          { description: "Conduct post-project review call", estimated_hrs: 0.5 },
          { description: "Request testimonial and referrals", estimated_hrs: 0.5 },
        ],
      },
    ],
  },
  {
    name: "Kitchen-Only Project",
    category: "Residential",
    department: "Design",
    description:
      "Full-scope kitchen design from concept through installation. Includes cabinetry, appliances, countertops, lighting, and finish selections.",
    triggered_by: "Signed contract and deposit received",
    done_when: "Kitchen installed, punch list complete, final invoice paid",
    scope_risk_level: "medium",
    common_failure_modes:
      "Appliance lead times extending project timeline; cabinet specification errors requiring reorders; scope expanding to adjacent spaces.",
    phases: [
      {
        name: "Programming & Site Verification",
        expected_hrs: 3.0, billable: true,
        triggered_by: "Kickoff complete",
        done_when: "Existing conditions documented, program confirmed",
        steps: [
          { description: "Conduct site visit and field verify all dimensions", estimated_hrs: 1.5 },
          { description: "Document existing conditions — plumbing, electrical, window locations", estimated_hrs: 0.5 },
          { description: "Confirm program — functional requirements, wish list, non-negotiables", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Concept Design",
        expected_hrs: 8.0, billable: true,
        triggered_by: "Program confirmed",
        done_when: "Concept direction approved in writing",
        steps: [
          { description: "Develop 1–2 layout options", estimated_hrs: 3.0 },
          { description: "Develop material and finish direction", estimated_hrs: 2.0 },
          { description: "Prepare and present concept", estimated_hrs: 2.0 },
          { description: "Revise and obtain written approval", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Design Development & Specification",
        expected_hrs: 12.0, billable: true,
        triggered_by: "Concept approved",
        done_when: "All selections finalized, cabinetry drawings approved",
        steps: [
          { description: "Develop detailed kitchen plan and elevations", estimated_hrs: 4.0 },
          { description: "Specify all cabinetry — layout, door style, hardware", estimated_hrs: 3.0 },
          { description: "Select all appliances, plumbing fixtures, lighting", estimated_hrs: 2.0 },
          { description: "Select countertop material and edge detail", estimated_hrs: 1.0 },
          { description: "Present and obtain written approval", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "Procurement",
        expected_hrs: 8.0, billable: true,
        triggered_by: "All selections approved",
        done_when: "All items ordered and confirmed",
        steps: [
          { description: "Issue purchase orders — cabinetry, appliances, fixtures", estimated_hrs: 2.0 },
          { description: "Confirm acknowledgments and lead times", estimated_hrs: 1.0 },
          { description: "Coordinate countertop template appointment", estimated_hrs: 0.5 },
          { description: "Maintain procurement log and track all items", estimated_hrs: 4.0 },
          { description: "Coordinate delivery schedule with contractor", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Construction Oversight & Installation",
        expected_hrs: 10.0, billable: true,
        triggered_by: "Demolition commenced",
        done_when: "All items installed, punch list signed off",
        steps: [
          { description: "Conduct site visits during rough-in and cabinetry install", estimated_hrs: 4.0 },
          { description: "Oversee countertop installation and final tile work", estimated_hrs: 2.0 },
          { description: "Oversee appliance installation and final trim", estimated_hrs: 2.0 },
          { description: "Prepare and clear punch list", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "Styling & Close",
        expected_hrs: 3.0, billable: true,
        triggered_by: "Construction complete",
        done_when: "Final invoice paid",
        steps: [
          { description: "Style kitchen — accessories, small appliances, art", estimated_hrs: 1.5 },
          { description: "Final client walkthrough", estimated_hrs: 0.5 },
          { description: "Issue final invoice and project archive", estimated_hrs: 0.5 },
          { description: "Request testimonial", estimated_hrs: 0.5 },
        ],
      },
    ],
  },
  {
    name: "FF&E Procurement",
    category: "Residential / Commercial",
    department: "Procurement",
    description:
      "Standalone procurement service for furniture, fixtures, and equipment. Used when design is complete and client engages the firm to source, purchase, and coordinate delivery.",
    triggered_by: "Design approved, procurement retainer or agreement signed",
    done_when: "All items delivered, inspected, and accepted by client. Final accounting reconciled.",
    scope_risk_level: "medium",
    common_failure_modes:
      "Discontinued items requiring re-specification; damage on delivery requiring claims; client changes after orders placed; vendor delays.",
    phases: [
      {
        name: "Procurement Setup",
        expected_hrs: 3.0, billable: true,
        triggered_by: "Procurement agreement signed",
        done_when: "Procurement schedule and budget approved by client",
        steps: [
          { description: "Compile complete FF&E schedule from design documents", estimated_hrs: 1.0 },
          { description: "Verify all items are currently available and confirm lead times", estimated_hrs: 1.0 },
          { description: "Prepare procurement budget with itemized costs", estimated_hrs: 0.5 },
          { description: "Present schedule and budget for client approval", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Purchase Orders & Vendor Management",
        expected_hrs: 6.0, billable: true,
        triggered_by: "Budget approved by client, deposit funds received",
        done_when: "All purchase orders issued and acknowledged",
        steps: [
          { description: "Collect client deposit for purchases", estimated_hrs: 0.25 },
          { description: "Issue purchase orders to all vendors", estimated_hrs: 2.0 },
          { description: "Collect order acknowledgments and confirm specifications on each order", estimated_hrs: 2.0 },
          { description: "Log all orders in procurement tracker", estimated_hrs: 1.0 },
          { description: "Set up follow-up schedule for each vendor", estimated_hrs: 0.75 },
        ],
      },
      {
        name: "Tracking & Client Updates",
        expected_hrs: 8.0, billable: true,
        triggered_by: "All orders placed",
        done_when: "All items confirmed ready for delivery",
        steps: [
          { description: "Weekly vendor follow-up on all open orders", estimated_hrs: 4.0 },
          { description: "Send bi-weekly client update with status of all items", estimated_hrs: 2.0 },
          { description: "Manage any issues — substitutions, damage claims, delays", estimated_hrs: 1.5 },
          { description: "Coordinate receiving warehouse or direct delivery logistics", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Delivery & Receiving",
        expected_hrs: 6.0, billable: true,
        triggered_by: "All items confirmed ready",
        done_when: "All items received, inspected, and cleared or claims filed",
        steps: [
          { description: "Coordinate delivery schedule", estimated_hrs: 1.0 },
          { description: "Oversee delivery and white glove installation", estimated_hrs: 3.0 },
          { description: "Inspect all items on delivery — document any damage", estimated_hrs: 1.0 },
          { description: "File damage claims immediately if required", estimated_hrs: 0.5 },
          { description: "Confirm client acceptance of all items", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Final Accounting & Close",
        expected_hrs: 3.0, billable: true,
        triggered_by: "All items received and accepted",
        done_when: "Final invoice paid, all accounts reconciled",
        steps: [
          { description: "Reconcile all purchase orders against invoices received", estimated_hrs: 1.5 },
          { description: "Prepare final client accounting — itemized list of all purchases", estimated_hrs: 1.0 },
          { description: "Issue final invoice for any remaining balance", estimated_hrs: 0.25 },
          { description: "Send warranties, care instructions, and vendor contacts to client", estimated_hrs: 0.25 },
        ],
      },
    ],
  },
  {
    name: "Space Planning Only",
    category: "Residential / Commercial",
    department: "Design",
    description:
      "Focused engagement to develop and document a space plan. No material selections, no procurement. Deliverable is an approved floor plan and furniture layout the client can execute independently or use to engage contractors.",
    triggered_by: "Signed agreement and deposit",
    done_when: "Space plan approved in writing, final deliverables sent to client",
    scope_risk_level: "low",
    common_failure_modes:
      "Client requesting material selections outside scope; multiple layout revisions beyond agreed rounds; structural constraints discovered after engagement begins.",
    phases: [
      {
        name: "Discovery & Site Review",
        expected_hrs: 2.5, billable: true,
        triggered_by: "Agreement signed",
        done_when: "Existing conditions documented, requirements confirmed",
        steps: [
          { description: "Review any existing drawings or measurements provided by client", estimated_hrs: 0.5 },
          { description: "Conduct site visit or virtual walkthrough", estimated_hrs: 1.0 },
          { description: "Field verify key dimensions if in-person", estimated_hrs: 0.5 },
          { description: "Document functional requirements and wish list", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Space Plan Development",
        expected_hrs: 6.0, billable: true,
        triggered_by: "Discovery complete",
        done_when: "Up to two layout options ready for presentation",
        steps: [
          { description: "Develop up to two layout options in CAD or design software", estimated_hrs: 4.0 },
          { description: "Annotate plans with key dimensions and furniture notes", estimated_hrs: 1.0 },
          { description: "Prepare presentation format", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Presentation & Revisions",
        expected_hrs: 3.5, billable: true,
        triggered_by: "Options ready",
        done_when: "Final plan approved in writing",
        steps: [
          { description: "Present options to client", estimated_hrs: 1.0 },
          { description: "Document feedback and preferred direction", estimated_hrs: 0.5 },
          { description: "Revise preferred option — one round of revisions included", estimated_hrs: 1.5 },
          { description: "Obtain written approval of final plan", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Deliverables & Close",
        expected_hrs: 1.5, billable: true,
        triggered_by: "Plan approved",
        done_when: "Files sent, final invoice paid",
        steps: [
          { description: "Export final plan in agreed formats — PDF, DWG if applicable", estimated_hrs: 0.5 },
          { description: "Prepare furniture reference list if requested (within scope)", estimated_hrs: 0.5 },
          { description: "Send final deliverables and invoice", estimated_hrs: 0.5 },
        ],
      },
    ],
  },
  {
    name: "Construction Administration",
    category: "Residential / Commercial",
    department: "Design / Project Management",
    description:
      "Ongoing oversight of construction to ensure work is executed per the design intent. Used when the firm has completed design and is retained to oversee the build phase separately.",
    triggered_by: "Construction commencement, CA agreement signed",
    done_when: "Certificate of substantial completion issued, punch list cleared",
    scope_risk_level: "high",
    common_failure_modes:
      "Contractor deviating from drawings without RFI; client making on-site decisions that contradict design; scope of CA visits underestimated; change orders not documented in writing.",
    phases: [
      {
        name: "Pre-Construction Setup",
        expected_hrs: 3.0, billable: true,
        triggered_by: "CA agreement signed",
        done_when: "All parties aligned, communication protocols established",
        steps: [
          { description: "Review final construction documents and specifications", estimated_hrs: 1.0 },
          { description: "Conduct pre-construction meeting with contractor and all trades", estimated_hrs: 1.5 },
          { description: "Establish RFI, submittal, and change order protocols", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Regular Site Visits",
        expected_hrs: 24.0, billable: true,
        triggered_by: "Construction commenced",
        done_when: "Substantial completion reached",
        steps: [
          { description: "Conduct scheduled site visits — frequency per agreement", estimated_hrs: 16.0 },
          { description: "Document each visit with photos and written field report", estimated_hrs: 4.0 },
          { description: "Distribute field reports to client and contractor", estimated_hrs: 2.0 },
          { description: "Follow up on any outstanding items from prior visits", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "RFI & Submittal Review",
        expected_hrs: 8.0, billable: true,
        triggered_by: "RFIs and submittals received from contractor",
        done_when: "All RFIs resolved, all submittals reviewed and approved",
        steps: [
          { description: "Review and respond to RFIs within agreed turnaround time", estimated_hrs: 4.0 },
          { description: "Review shop drawings and submittals for compliance with design intent", estimated_hrs: 3.0 },
          { description: "Log all RFIs and submittals and maintain record set", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Change Order Management",
        expected_hrs: 4.0, billable: true,
        triggered_by: "Any deviation from scope or design",
        done_when: "All changes documented, priced, and approved in writing",
        steps: [
          { description: "Review proposed change orders from contractor", estimated_hrs: 2.0 },
          { description: "Advise client on merit and recommended response", estimated_hrs: 1.0 },
          { description: "Document all approved changes in project record", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Punch List & Close",
        expected_hrs: 5.0, billable: true,
        triggered_by: "Contractor indicates substantial completion",
        done_when: "All punch list items cleared, final CA certificate issued",
        steps: [
          { description: "Conduct substantial completion walkthrough with contractor", estimated_hrs: 2.0 },
          { description: "Prepare and issue punch list", estimated_hrs: 1.0 },
          { description: "Conduct follow-up visits to verify punch list completion", estimated_hrs: 1.5 },
          { description: "Issue final completion certificate", estimated_hrs: 0.5 },
        ],
      },
    ],
  },
  {
    name: "Commercial Project",
    category: "Commercial",
    department: "Design",
    description:
      "Full-scope commercial interior design for office, retail, hospitality, or mixed-use. Includes programming, design, documentation, and CA. Assumes coordination with architect and consultants.",
    triggered_by: "Signed agreement and project kickoff meeting complete",
    done_when: "Occupancy achieved, punch list cleared, project closed",
    scope_risk_level: "high",
    common_failure_modes:
      "Scope creep from stakeholder changes; code and ADA requirements requiring design revisions; consultant coordination delays; value engineering eroding design intent.",
    phases: [
      {
        name: "Programming",
        expected_hrs: 10.0, billable: true,
        triggered_by: "Agreement signed, kickoff complete",
        done_when: "Program document approved by client stakeholders",
        steps: [
          { description: "Conduct stakeholder interviews — department heads, end users", estimated_hrs: 4.0 },
          { description: "Analyze adjacency requirements and workflow", estimated_hrs: 2.0 },
          { description: "Develop space program with area requirements per function", estimated_hrs: 2.0 },
          { description: "Present and obtain approval from all required stakeholders", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "Schematic Design",
        expected_hrs: 20.0, billable: true,
        triggered_by: "Program approved",
        done_when: "Schematic design approved by client",
        steps: [
          { description: "Develop block plans and test fits", estimated_hrs: 6.0 },
          { description: "Develop concept direction — brand alignment, material palette", estimated_hrs: 5.0 },
          { description: "Coordinate with architect on base building constraints", estimated_hrs: 2.0 },
          { description: "Prepare schematic presentation", estimated_hrs: 4.0 },
          { description: "Present and revise per feedback", estimated_hrs: 3.0 },
        ],
      },
      {
        name: "Design Development",
        expected_hrs: 30.0, billable: true,
        triggered_by: "Schematic approved",
        done_when: "All design elements finalized, specifications complete",
        steps: [
          { description: "Develop detailed floor plans, elevations, and sections", estimated_hrs: 10.0 },
          { description: "Develop all finish and material specifications", estimated_hrs: 6.0 },
          { description: "Develop furniture plan and specifications", estimated_hrs: 6.0 },
          { description: "Coordinate with MEP, lighting, and AV consultants", estimated_hrs: 4.0 },
          { description: "Prepare DD presentation and obtain approval", estimated_hrs: 4.0 },
        ],
      },
      {
        name: "Construction Documents",
        expected_hrs: 24.0, billable: true,
        triggered_by: "Design development approved",
        done_when: "Permit documents issued, bid set complete",
        steps: [
          { description: "Prepare full interior CD set — plans, elevations, details, schedules", estimated_hrs: 14.0 },
          { description: "Coordinate with all consultants on combined drawing set", estimated_hrs: 4.0 },
          { description: "Prepare specifications book", estimated_hrs: 4.0 },
          { description: "Internal QC review and issue for permit", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "Bidding & Contractor Selection",
        expected_hrs: 6.0, billable: true,
        triggered_by: "CD set complete",
        done_when: "Contractor selected, contract executed",
        steps: [
          { description: "Prepare bid package and instructions to bidders", estimated_hrs: 1.5 },
          { description: "Distribute to pre-qualified contractors", estimated_hrs: 0.5 },
          { description: "Conduct pre-bid walkthrough", estimated_hrs: 1.0 },
          { description: "Review bids and prepare comparison analysis", estimated_hrs: 2.0 },
          { description: "Advise client on contractor selection", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Construction Administration",
        expected_hrs: 30.0, billable: true,
        triggered_by: "Construction commenced",
        done_when: "Substantial completion, punch list cleared",
        steps: [
          { description: "Conduct regular site visits — typically weekly", estimated_hrs: 14.0 },
          { description: "RFI and submittal review", estimated_hrs: 8.0 },
          { description: "Change order review and management", estimated_hrs: 4.0 },
          { description: "Prepare and distribute field reports", estimated_hrs: 3.0 },
          { description: "Punch list and close", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Project Close",
        expected_hrs: 4.0, billable: true,
        triggered_by: "Substantial completion",
        done_when: "Final invoice paid, project archive delivered",
        steps: [
          { description: "Compile as-built record set", estimated_hrs: 1.5 },
          { description: "Prepare and deliver project archive", estimated_hrs: 1.0 },
          { description: "Final accounting and invoice", estimated_hrs: 1.0 },
          { description: "Post-occupancy evaluation — optional follow-up visit", estimated_hrs: 0.5 },
        ],
      },
    ],
  },
  {
    name: "Design-Build",
    category: "Residential",
    department: "Design / Construction",
    description:
      "Integrated design and construction delivery where the firm manages both the design process and the construction team. Highest complexity and highest scope risk. Requires clear change order protocols from day one.",
    triggered_by: "Design-build agreement signed, deposit collected",
    done_when: "Certificate of occupancy issued or equivalent project completion, final payment received",
    scope_risk_level: "high",
    common_failure_modes:
      "Design changes after construction begins; subcontractor coordination failures; client scope additions treated as relationship favors rather than change orders; cost overruns attributed to design rather than execution.",
    phases: [
      {
        name: "Pre-Design & Budgeting",
        expected_hrs: 8.0, billable: true,
        triggered_by: "Agreement signed",
        done_when: "Preliminary budget approved, design brief confirmed",
        steps: [
          { description: "Conduct site assessment and existing conditions review", estimated_hrs: 2.0 },
          { description: "Develop preliminary construction budget with allowances", estimated_hrs: 3.0 },
          { description: "Develop design brief and project scope definition", estimated_hrs: 2.0 },
          { description: "Present budget and brief for client approval", estimated_hrs: 1.0 },
        ],
      },
      {
        name: "Schematic Design & Pricing",
        expected_hrs: 18.0, billable: true,
        triggered_by: "Budget and brief approved",
        done_when: "Schematic design and refined budget approved",
        steps: [
          { description: "Develop schematic design", estimated_hrs: 8.0 },
          { description: "Develop subcontractor bid packages for schematic scope", estimated_hrs: 4.0 },
          { description: "Collect and analyze subcontractor bids", estimated_hrs: 2.0 },
          { description: "Refine budget based on actual bids", estimated_hrs: 2.0 },
          { description: "Present design and budget for approval", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "Design Development & Permits",
        expected_hrs: 20.0, billable: true,
        triggered_by: "Schematic and budget approved",
        done_when: "Permits in hand, all selections finalized",
        steps: [
          { description: "Develop full construction documents", estimated_hrs: 10.0 },
          { description: "Finalize all material and finish selections", estimated_hrs: 5.0 },
          { description: "Submit for permits and manage permit process", estimated_hrs: 3.0 },
          { description: "Finalize subcontractor agreements", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "Construction Management",
        expected_hrs: 40.0, billable: true,
        triggered_by: "Permits received, construction mobilized",
        done_when: "Construction complete, punch list cleared",
        steps: [
          { description: "Manage all subcontractor scheduling and coordination", estimated_hrs: 12.0 },
          { description: "Conduct daily or weekly site supervision visits", estimated_hrs: 16.0 },
          { description: "Process all subcontractor invoices and manage draw schedule", estimated_hrs: 6.0 },
          { description: "Manage all change orders with written client approval", estimated_hrs: 4.0 },
          { description: "Punch list and final walkthrough", estimated_hrs: 2.0 },
        ],
      },
      {
        name: "FF&E Installation & Close",
        expected_hrs: 12.0, billable: true,
        triggered_by: "Construction complete",
        done_when: "Project complete, all payments received",
        steps: [
          { description: "Coordinate and oversee all furniture installation", estimated_hrs: 6.0 },
          { description: "Style and final photography prep", estimated_hrs: 2.0 },
          { description: "Final client walkthrough and acceptance", estimated_hrs: 1.0 },
          { description: "Final accounting — reconcile all costs against budget", estimated_hrs: 2.0 },
          { description: "Issue final invoice and project archive", estimated_hrs: 1.0 },
        ],
      },
    ],
  },
  {
    name: "Styling / Refresh",
    category: "Residential",
    department: "Design",
    description:
      "Lighter-touch engagement to refresh an existing space through accessories, art, plants, textiles, and minor furniture additions. No construction. Focused on immediate impact with existing architecture.",
    triggered_by: "Signed agreement and deposit",
    done_when: "Styling session complete, client satisfied, final invoice paid",
    scope_risk_level: "low",
    common_failure_modes:
      "Client expecting major transformation within refresh budget; scope expanding to include painting or minor construction; sourcing items that require long lead times for a quick-turn project.",
    phases: [
      {
        name: "Discovery & Assessment",
        expected_hrs: 2.0, billable: true,
        triggered_by: "Agreement signed",
        done_when: "Assessment complete, refresh plan confirmed",
        steps: [
          { description: "Conduct site visit or virtual walkthrough", estimated_hrs: 1.0 },
          { description: "Photograph existing space and identify opportunities", estimated_hrs: 0.5 },
          { description: "Confirm scope and budget for refresh items", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Sourcing & Curation",
        expected_hrs: 5.0, billable: true,
        triggered_by: "Scope and budget confirmed",
        done_when: "All items sourced and approved by client",
        steps: [
          { description: "Source accessories, textiles, art, and plants within budget", estimated_hrs: 3.0 },
          { description: "Prepare curated presentation of proposed items", estimated_hrs: 1.0 },
          { description: "Present and obtain client approval on all items", estimated_hrs: 0.5 },
          { description: "Order all approved items", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Styling Day",
        expected_hrs: 6.0, billable: true,
        triggered_by: "All items received",
        done_when: "Styling complete, client walkthrough done",
        steps: [
          { description: "Prepare all items before arrival — unbox, assemble, clean", estimated_hrs: 0.5 },
          { description: "Execute styling — placement of all accessories, art, textiles, plants", estimated_hrs: 4.0 },
          { description: "Photograph finished spaces", estimated_hrs: 1.0 },
          { description: "Client walkthrough and any final adjustments", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Close",
        expected_hrs: 1.0, billable: true,
        triggered_by: "Styling day complete",
        done_when: "Final invoice paid",
        steps: [
          { description: "Issue final invoice for any remaining balance", estimated_hrs: 0.25 },
          { description: "Send care notes for any plants or delicate items", estimated_hrs: 0.25 },
          { description: "Request testimonial and permission to share photos", estimated_hrs: 0.5 },
        ],
      },
    ],
  },
  {
    name: "Virtual Design Consultation",
    category: "Residential",
    department: "Design",
    description:
      "Remote design engagement delivered via video call and digital deliverables. Ideal for clients outside local market or those seeking guidance without full-service commitment. Deliverable is a digital design direction document the client implements themselves.",
    triggered_by: "Booking confirmed and pre-consultation questionnaire received",
    done_when: "Consultation delivered, digital deliverables sent, final invoice paid",
    scope_risk_level: "low",
    common_failure_modes:
      "Client expecting in-person level service at virtual price; scope creeping into ongoing advice beyond agreed sessions; tech issues during consultation.",
    phases: [
      {
        name: "Pre-Consultation Preparation",
        expected_hrs: 1.5, billable: true,
        triggered_by: "Questionnaire received and booking confirmed",
        done_when: "Agenda prepared, space review complete",
        steps: [
          { description: "Review client questionnaire and any photos or floor plans submitted", estimated_hrs: 0.75 },
          { description: "Research relevant inspiration and product options", estimated_hrs: 0.5 },
          { description: "Prepare consultation agenda and talking points", estimated_hrs: 0.25 },
        ],
      },
      {
        name: "Consultation Session",
        expected_hrs: 1.5, billable: true,
        triggered_by: "Scheduled consultation time",
        done_when: "Session complete, notes documented",
        steps: [
          { description: "Conduct video consultation — space review, priorities, direction", estimated_hrs: 1.0 },
          { description: "Document key decisions, recommendations, and client preferences", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Digital Deliverables",
        expected_hrs: 3.0, billable: true,
        triggered_by: "Consultation session complete",
        done_when: "All deliverables sent to client",
        steps: [
          { description: "Prepare design direction summary — layout recommendations, color palette, key pieces", estimated_hrs: 1.5 },
          { description: "Compile sourcing guide — specific product links within client budget", estimated_hrs: 1.0 },
          { description: "Prepare and send final document package", estimated_hrs: 0.5 },
        ],
      },
      {
        name: "Follow-Up & Close",
        expected_hrs: 0.5, billable: true,
        triggered_by: "Deliverables sent",
        done_when: "Invoice paid",
        steps: [
          { description: "Send follow-up email with any final notes or clarifications", estimated_hrs: 0.25 },
          { description: "Request testimonial", estimated_hrs: 0.25 },
        ],
      },
    ],
  },
];

export async function seedDefaultSops(firmId: string): Promise<{ inserted: number; skipped: number }> {
  // Dedupe by name within this firm.
  const { data: existing } = await supabaseAdmin
    .from("sop_templates")
    .select("name")
    .eq("firm_id", firmId);
  const existingNames = new Set((existing ?? []).map((r) => r.name));

  let inserted = 0;
  let skipped = 0;

  for (const tpl of DEFAULT_SOP_TEMPLATES) {
    if (existingNames.has(tpl.name)) {
      skipped++;
      continue;
    }
    const { data: tplRow, error: tplErr } = await supabaseAdmin
      .from("sop_templates")
      .insert({
        firm_id: firmId,
        name: tpl.name,
        category: tpl.category,
        department: tpl.department,
        description: tpl.description,
        triggered_by: tpl.triggered_by,
        done_when: tpl.done_when,
        scope_risk_level: tpl.scope_risk_level,
        common_failure_modes: tpl.common_failure_modes,
        is_default: true,
      })
      .select("id")
      .single();
    if (tplErr || !tplRow) {
      console.error(`[seedDefaultSops] failed to insert template "${tpl.name}":`, tplErr);
      continue;
    }

    for (let i = 0; i < tpl.phases.length; i++) {
      const ph = tpl.phases[i];
      const { data: phRow, error: phErr } = await supabaseAdmin
        .from("sop_phases")
        .insert({
          firm_id: firmId,
          template_id: tplRow.id,
          name: ph.name,
          expected_hrs: ph.expected_hrs,
          billable: ph.billable,
          description: ph.triggered_by || ph.done_when
            ? `Triggered by: ${ph.triggered_by ?? "—"}\nDone when: ${ph.done_when ?? "—"}`
            : null,
          sort_order: i,
        })
        .select("id")
        .single();
      if (phErr || !phRow) {
        console.error(`[seedDefaultSops] failed to insert phase "${ph.name}":`, phErr);
        continue;
      }
      if (ph.steps.length) {
        const { error: stepsErr } = await supabaseAdmin.from("sop_steps").insert(
          ph.steps.map((s, j) => ({
            phase_id: phRow.id,
            description: s.description,
            estimated_hrs: s.estimated_hrs,
            sort_order: j,
          })),
        );
        if (stepsErr) console.error(`[seedDefaultSops] failed to insert steps for "${ph.name}":`, stepsErr);
      }
    }
    inserted++;
  }
  return { inserted, skipped };
}