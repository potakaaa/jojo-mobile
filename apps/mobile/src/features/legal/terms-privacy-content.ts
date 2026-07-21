/**
 * Boilerplate ToS/Privacy copy — NOT final legal-reviewed text; swap this file's
 * content when real copy is supplied. Content-only change point (see AUTH-003 plan).
 *
 * Intentionally generic legal-boilerplate framing: no specific jurisdiction/venue,
 * no specific data-retention duration commitment, and no named third-party payment
 * or data processor (processor/payment decisions remain open per all-context.md
 * §Open Questions). Keep it that way until real, locked policy is available.
 */

/** One labeled section of the combined Terms & Privacy screen. */
export type LegalSection = {
  group: 'terms' | 'privacy';
  heading: string;
  body: string;
};

/** Human-readable date shown once at the top of the combined screen. */
export const LEGAL_LAST_UPDATED = 'July 21, 2026';

/**
 * The single source of truth for the Terms & Privacy screen's copy. Rendered by
 * `TermsPrivacyBody` and shared by both route files (`(auth)/terms.tsx` and
 * `(tabs)/terms/index.tsx`) so the text lives in exactly one place.
 */
export const LEGAL_SECTIONS: LegalSection[] = [
  {
    group: 'terms',
    heading: 'Acceptance of Terms',
    body: 'By creating an account or placing an order through the Jojo Potato app, you agree to these Terms & Conditions. If you do not agree with any part of them, please stop using the app. We may update these terms from time to time, and continued use of the app after an update means you accept the revised terms.',
  },
  {
    group: 'terms',
    heading: 'Eligibility',
    body: 'You must be able to form a legally binding contract to use the app. If you are a minor in your jurisdiction, please have a parent or guardian review these terms with you before you use the app.',
  },
  {
    group: 'terms',
    heading: 'Using the Service',
    body: 'The app lets you browse menus, place pickup orders, and take part in rewards and promotions offered by participating branches. You agree to use the app only for lawful purposes, to provide accurate information, and not to interfere with or misuse the service. Menu availability, pricing, and pickup times may vary by branch and can change without notice.',
  },
  {
    group: 'terms',
    heading: 'Orders & Payments',
    body: 'When you place an order, you are making a request that a branch may accept or decline. Prices are shown in the app at the time you order and may be subject to applicable taxes and fees. Payment options depend on what the branch supports, and any charges are handled through the payment method you choose at checkout. If an order cannot be fulfilled, we will work with the branch to arrange an appropriate resolution.',
  },
  {
    group: 'terms',
    heading: 'Accounts & Rewards',
    body: 'You are responsible for keeping your account details and sign-in credentials secure and for any activity under your account. Rewards, stars, and promotional offers have no cash value, may carry their own conditions, and may be changed or withdrawn. We may suspend or close an account that appears to be misused or that violates these terms.',
  },
  {
    group: 'terms',
    heading: 'Limitation of Liability',
    body: 'To the extent permitted by applicable law, Jojo Potato is not liable for indirect, incidental, or consequential damages arising from your use of the app. Where liability cannot be excluded, our total liability for any claim relating to an order is limited to the amount you paid for that order.',
  },
  {
    group: 'terms',
    heading: 'Changes to These Terms',
    body: 'We may revise these Terms & Conditions as the app and its features evolve. When we make a significant change, we will make the updated terms available in the app. It is your responsibility to review the terms periodically.',
  },
  {
    group: 'privacy',
    heading: 'Information We Collect',
    body: 'To provide the service, we collect the information you give us — such as your name, contact details, and the address you add to your profile — along with details about the orders you place. We also collect basic technical information needed to run the app reliably, such as device and usage information.',
  },
  {
    group: 'privacy',
    heading: 'How We Use Your Information',
    body: 'We use your information to process and fulfil your orders, operate your account and rewards, keep the service secure, and improve the app. Where you have opted in, we may also send you updates about offers and promotions; you can change your notification preferences at any time in the app.',
  },
  {
    group: 'privacy',
    heading: 'Sharing & Security',
    body: 'We share your information only as needed to run the service — for example, with the branch fulfilling your order — and we do not sell your personal information. We take reasonable measures intended to protect your information, though no method of storage or transmission can be guaranteed to be completely secure.',
  },
  {
    group: 'privacy',
    heading: 'Your Choices & Contact',
    body: 'You can review and update your profile details in the app and adjust your notification preferences at any time. If you have questions about your information or how it is handled, please reach out to us through the support options available in the app.',
  },
];
