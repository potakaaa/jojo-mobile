# PRD: Jojo Potato Tech-First Mobile App MVP

## 1. Product Overview

Jojo Potato will launch a mobile app that turns the brand from a walk-in snack shop into a tech-first, repeat-purchase customer platform.

The app should not only show products. It should create a habit loop:

**Discover deal → order pickup → earn stars → receive update → redeem reward → come back again**

The MVP will focus on four core pillars:

1. Branch locator
2. In-app exclusive deals
3. Gamified stars/rewards system
4. Pickup ordering with live order updates

The goal is to make customers think:

> “Before I buy Jojo Potato, I should check the app first.”

---

## 2. Goals

### Business Goals

* Increase repeat purchases from existing customers.
* Drive app installs through exclusive in-app deals.
* Increase branch-level sales through pickup ordering.
* Build a customer database for future promotions, loyalty, and personalization.
* Reduce customer waiting uncertainty through live pickup status.
* Create a digital loyalty system instead of relying only on physical stamp cards or manual promos.

### Product Goals

* Let customers find the nearest Jojo Potato branch.
* Let customers browse menu items and branch-specific deals.
* Let customers order for pickup.
* Let customers track order status in real time.
* Let customers earn stars for eligible purchases.
* Let customers redeem rewards after reaching a target.
* Let staff manage pickup orders from a simple branch dashboard.
* Let admins manage branches, products, deals, rewards, and orders.

---

## 3. Non-Goals for MVP

The MVP should not include everything yet.

Out of scope for MVP:

* Full delivery logistics
* Third-party delivery integration
* Wallet balance or stored credits
* Advanced AI personalization
* Franchise application system
* Catering/event ordering
* In-app chat support
* Complex tier system like Silver/Gold/VIP
* Social leaderboards
* Referral program
* Multi-country support
* Kitchen inventory automation

These can be added after validating app usage, pickup volume, and loyalty adoption.

---

## 4. Target Users

### 4.1 Customer

A Jojo Potato customer who wants to:

* Find the nearest branch
* Check current deals
* Order ahead for pickup
* Avoid waiting in line
* Earn rewards
* Redeem free items or discounts

### 4.2 Branch Staff

A branch employee who needs to:

* See incoming pickup orders
* Accept or reject orders
* Set estimated preparation time
* Update order status
* Mark orders as ready
* Mark orders as picked up
* Validate reward redemption

### 4.3 Admin / Marketing Team

A Jojo Potato admin who needs to:

* Manage branches
* Manage menu items
* Manage pricing
* Create app-exclusive deals
* Create reward rules
* View basic order analytics
* View customer activity
* Enable or disable products per branch

---

## 5. Product Principles

1. **Deals first**
   The app should immediately show value through exclusive offers.

2. **Pickup should feel fast**
   Ordering ahead should feel easier than walking in.

3. **Rewards should be visual**
   Customers should always see progress toward a free item.

4. **Branch operations must be simple**
   Staff should only need a few taps to process orders.

5. **Use the existing Jojo Potato design system**
   The app should reuse the CSS tokens, brand colors, typography, spacing, and visual identity already copied from the website.

6. **MVP should be easy to operate**
   Avoid complex rules engines at first. Build simple but scalable structures.

---

## 6. MVP Feature Scope

## 6.1 Authentication and Onboarding

### Description

Customers should be able to create an account quickly. The MVP should avoid long signup forms.

### Requirements

* Allow login/signup using phone number OTP or email/password.
* Collect only required customer information:

  * Full name
  * Phone number or email
  * Birthday, optional
  * Favorite branch, optional
* Show onboarding screens introducing:

  * App-exclusive deals
  * Pickup ordering
  * Jojo Stars rewards

### Acceptance Criteria

* User can create an account in under 60 seconds.
* User can skip non-essential profile fields.
* User lands on the Home screen after onboarding.
* Returning users stay logged in unless they manually log out.

---

## 6.2 Home Screen

### Description

The Home screen is the main growth surface. It should immediately show the user why they should use the app.

### Main Sections

1. Nearest branch card
2. Featured deal
3. Jojo Stars progress
4. Order pickup CTA
5. Popular items
6. Reorder previous order, if available

### Requirements

* Show nearest branch if location permission is enabled.
* Show fallback branch selection if location permission is disabled.
* Show active app-exclusive deal.
* Show customer reward progress.
* Show primary CTA: “Order for Pickup.”
* Show recent order shortcut after the user has at least one completed order.

### Acceptance Criteria

* User can start an order from the Home screen.
* User can view current reward progress from the Home screen.
* User can access deals from the Home screen.
* User can select or change branch from the Home screen.

---

## 6.3 Branch Locator

### Description

Customers should be able to find Jojo Potato branches and choose where to order from.

### Requirements

Each branch should display:

* Branch name
* Address
* Distance from user
* Opening hours
* Open/closed status
* Pickup availability
* Estimated preparation time
* Directions link
* Available deals for that branch
* “Order from this branch” CTA

### MVP Map/List Behavior

* Default to list view first for simplicity.
* Map view can be included if already easy to implement.
* Branches should be searchable by location or branch name.
* If location permission is denied, show all branches sorted by admin-defined priority.

### Acceptance Criteria

* User can view all active branches.
* User can see whether a branch is open or closed.
* User can select a branch before ordering.
* User cannot place pickup orders from closed or unavailable branches.
* User can open directions in Google Maps or Apple Maps.

---

## 6.4 Menu and Product Browsing

### Description

The menu should be optimized around cravings and fast ordering.

### Main Categories

* Fries
* Corndogs
* Nuggets
* Lemonade
* Combos
* Deals

### Product Requirements

Each product should support:

* Name
* Description
* Image
* Category
* Base price
* Available sizes
* Available flavors
* Add-ons, optional
* Branch availability
* Active/inactive status
* Promo eligibility
* Reward eligibility

### Flavor Selection

For items like fries and drinks, customers should be able to select flavor before adding to cart.

Example flow:

**Choose Fries → Choose Size → Choose Flavor → Add to Cart**

### Acceptance Criteria

* User can browse products by category.
* User can select product options.
* User can add products to cart.
* User cannot add unavailable products.
* Product pricing updates correctly based on selected options.
* Menu follows existing design tokens and brand styling.

---

## 6.5 Cart and Checkout

### Description

Customers should be able to review their pickup order before placing it.

### Requirements

Cart should show:

* Selected branch
* Product items
* Size/flavor/options
* Quantity
* Subtotal
* Discount applied
* Total
* Estimated pickup time
* Applied coupon or deal
* Reward redemption, if applicable

### Payment Options for MVP

Recommended MVP options:

1. Pay at pickup
2. Online payment, optional if payment gateway is ready

If online payment is not ready, MVP can launch with **Reserve for Pickup / Pay at Branch** first.

### Acceptance Criteria

* User can increase/decrease item quantity.
* User can remove items from cart.
* User can apply eligible coupon/deal.
* User can place pickup order.
* User receives order confirmation after checkout.
* Cart clears after successful order placement.

---

## 6.6 Pickup Ordering

### Description

Pickup ordering is the core tech-first utility of the app.

### Customer Flow

1. Select branch
2. Select products
3. Customize item
4. Add to cart
5. Review order
6. Place pickup order
7. Track status
8. Pick up at branch

### Order Statuses

Use simple, brand-friendly statuses:

1. `pending` — Order received
2. `accepted` — Branch accepted order
3. `preparing` — Preparing your order
4. `flavoring` — Adding the flavor
5. `ready` — Ready for pickup
6. `completed` — Picked up
7. `cancelled` — Cancelled

### Customer-Facing Status Labels

* Order received
* Confirmed by branch
* Frying now
* Shaking the flavor
* Ready for pickup
* Picked up
* Cancelled

### Acceptance Criteria

* User can see live order status.
* User receives push notification when order is ready.
* User can see estimated pickup time.
* Staff can update order status.
* Completed orders are saved in order history.
* Cancelled orders do not earn stars.

---

## 6.7 Live Order Updates

### Description

Customers should receive live progress updates for pickup orders.

### Requirements

* Show real-time order status screen after checkout.
* Show estimated time until ready.
* Trigger push notifications for important status changes:

  * Order accepted
  * Order preparing
  * Order ready
  * Order cancelled
* Allow user to access active order from Home screen.

### Acceptance Criteria

* Order status updates without requiring app restart.
* User can leave the order screen and return later.
* User receives notification when order is ready.
* Staff status changes reflect on customer app.

---

## 6.8 In-App Exclusive Deals

### Description

Deals are one of the main reasons users should download and open the app.

### Deal Types for MVP

* First order discount
* Buy 1 Take 1
* Combo deal
* Branch-specific deal
* Time-limited deal
* Free upgrade
* Percentage discount
* Fixed amount discount

### Deal Fields

Each deal should have:

* Deal title
* Deal description
* Deal image/banner
* Deal type
* Discount value
* Eligible products
* Eligible branches
* Start date
* End date
* Usage limit per user
* Total usage limit, optional
* Minimum order amount, optional
* Active/inactive status

### Example MVP Deals

* First app order: Free lemonade upgrade
* Snack break deal: Fries + Lemonade bundle
* Buy 1 Take 1 lemonade
* Branch-exclusive opening promo
* Weekend combo deal

### Acceptance Criteria

* User can view active deals.
* User can apply eligible deals in cart.
* Expired deals are hidden or marked expired.
* Deals can be limited to specific branches.
* Deals can be limited to one use per user.
* Admin can create, update, activate, and deactivate deals.

---

## 6.9 Coupon Wallet

### Description

The Coupon Wallet stores deals and rewards available to the customer.

### Requirements

Coupon wallet should show:

* Available coupons
* Used coupons
* Expired coupons
* Reward coupons
* Deal details
* Expiration date
* Redeem CTA

### Acceptance Criteria

* User can view available coupons.
* User can apply coupon during checkout.
* Used coupons cannot be reused if single-use.
* Expired coupons cannot be applied.
* Reward coupons are generated after reaching required stars.

---

## 6.10 Jojo Stars Rewards System

### Description

Jojo Stars is the MVP loyalty system. It should be simple, visual, and habit-forming.

### MVP Reward Rule

Recommended starting rule:

**Buy 5 eligible items → get 1 free regular fries or lemonade**

Alternative:

**Earn 1 star per completed order above a minimum amount. Get 5 stars to unlock a free item.**

Choose one rule for MVP and keep it simple.

### Recommended MVP Rule

Use this for MVP:

* Customer earns 1 star for every completed eligible order.
* Order must reach minimum amount to earn a star.
* Cancelled orders do not earn stars.
* Refunded orders do not earn stars.
* After 5 stars, user receives a reward coupon.
* Reward coupon can be redeemed on a future order or in-store.

### Rewards Screen

Show:

* Current star progress
* Number of stars needed
* Reward preview
* Available rewards
* Reward history
* Terms and conditions

### Acceptance Criteria

* User earns stars after completed orders.
* User does not earn stars for cancelled orders.
* User sees progress visually.
* User receives reward coupon after reaching star goal.
* Stars reset or roll over after reward is issued.
* Admin can configure the number of stars required.

---

## 6.11 Order History and Reorder

### Description

Customers should be able to view past orders and quickly reorder.

### Requirements

Order history should show:

* Order date
* Branch
* Items ordered
* Total
* Order status
* Stars earned
* Reorder button

### Acceptance Criteria

* User can view past orders.
* User can reorder a completed order.
* Reorder checks current product availability and pricing.
* Unavailable items are flagged before checkout.

---

## 6.12 Push Notifications

### Description

Push notifications should support order updates and retention.

### MVP Notification Types

Transactional:

* Order accepted
* Order preparing
* Order ready
* Order cancelled

Marketing:

* New deal available
* Coupon expiring soon
* One more order to unlock reward
* Reward unlocked
* Branch-specific promo

### Acceptance Criteria

* User can opt in to push notifications.
* Transactional notifications are sent for active pickup orders.
* Marketing notifications respect user opt-in.
* Notification tap opens the relevant screen.

---

## 6.13 Staff Branch Dashboard

### Description

Branch staff need a simple interface to process pickup orders.

This can be a web dashboard inside the Turborepo, separate from the mobile app.

### Staff Dashboard Screens

1. Login
2. Active Orders
3. Order Details
4. Completed Orders
5. Product Availability

### Staff Order Actions

* Accept order
* Reject order
* Set estimated pickup time
* Mark as preparing
* Mark as flavoring
* Mark as ready
* Mark as picked up
* Cancel order

### Staff Requirements

* Staff should only see orders for their assigned branch.
* Staff should be able to update item availability.
* Staff should be able to pause pickup orders for the branch.
* Staff should be able to scan or enter pickup code.

### Acceptance Criteria

* Staff can view incoming orders in real time.
* Staff can update order status.
* Status updates reflect in customer app.
* Staff cannot access other branches unless authorized.
* Staff can mark products unavailable for their branch.

---

## 6.14 Admin Dashboard

### Description

Admins need tools to manage app content and operations.

This can be built as a simple web dashboard in the same Turborepo.

### Admin MVP Modules

1. Branches
2. Products
3. Categories
4. Deals
5. Orders
6. Rewards
7. Customers
8. Basic analytics

### Admin Requirements

Admin can:

* Create/edit branches
* Set branch hours
* Enable/disable pickup per branch
* Create/edit products
* Create/edit categories
* Set product availability
* Create/edit deals
* Assign deals to branches/products
* View customer list
* View orders
* Configure reward rules
* View basic sales and app usage metrics

### Acceptance Criteria

* Admin can manage active app content without code changes.
* Admin can disable a branch from accepting pickup orders.
* Admin can create time-limited deals.
* Admin can view order activity by branch.

---

## 7. Navigation Structure

### Mobile App Tabs

Recommended bottom tabs:

1. Home
2. Order
3. Rewards
4. Branches
5. Account

### Screen List

#### Public Screens

* Splash Screen
* Onboarding
* Login
* Signup / OTP
* Terms and Privacy

#### Customer Screens

* Home
* Branch Locator
* Branch Details
* Menu
* Product Details
* Cart
* Checkout
* Order Confirmation
* Active Order Tracking
* Order History
* Rewards
* Coupon Wallet
* Account
* Notifications
* Help / Support

#### Staff Screens

* Staff Login
* Active Orders
* Order Details
* Completed Orders
* Product Availability
* Branch Pickup Settings

#### Admin Screens

* Admin Login
* Dashboard
* Branch Management
* Product Management
* Category Management
* Deals Management
* Rewards Configuration
* Orders
* Customers
* Analytics

---

## 8. Core User Flows

## 8.1 First-Time User Deal Flow

1. User installs app.
2. User opens app.
3. User sees welcome deal.
4. User signs up.
5. User selects nearest branch.
6. User adds product to cart.
7. Welcome deal applies.
8. User places pickup order.
9. User receives live order updates.
10. User completes pickup.
11. User earns first Jojo Star.

## 8.2 Pickup Order Flow

1. User selects branch.
2. User browses menu.
3. User selects product, size, and flavor.
4. User adds item to cart.
5. User applies coupon, if available.
6. User confirms pickup order.
7. Staff accepts order.
8. User sees order status.
9. Staff marks order ready.
10. User picks up order.
11. Staff marks completed.
12. User earns star.

## 8.3 Reward Unlock Flow

1. User completes eligible orders.
2. User earns stars.
3. User reaches required number of stars.
4. System generates reward coupon.
5. User receives notification.
6. User views reward in Coupon Wallet.
7. User redeems reward on next order.
8. Reward is marked as used.

## 8.4 Branch Staff Flow

1. Staff logs into dashboard.
2. Staff sees new pickup order.
3. Staff accepts order and sets ETA.
4. Staff updates order status while preparing.
5. Staff marks order ready.
6. Customer arrives.
7. Staff confirms pickup.
8. Staff marks order completed.

---

## 9. Data Model Draft

## 9.1 users

Stores customer accounts.

Fields:

* id
* full_name
* email
* phone
* birthday
* favorite_branch_id
* role
* created_at
* updated_at

Roles:

* customer
* staff
* admin
* super_admin

---

## 9.2 branches

Stores branch information.

Fields:

* id
* name
* slug
* address
* latitude
* longitude
* phone
* opening_hours
* is_active
* is_accepting_pickup
* estimated_prep_minutes
* created_at
* updated_at

---

## 9.3 categories

Stores product categories.

Fields:

* id
* name
* slug
* sort_order
* is_active
* created_at
* updated_at

---

## 9.4 products

Stores menu products.

Fields:

* id
* category_id
* name
* slug
* description
* image_url
* base_price
* is_active
* is_reward_eligible
* created_at
* updated_at

---

## 9.5 product_options

Stores sizes, flavors, and add-ons.

Fields:

* id
* product_id
* option_type
* name
* price_delta
* is_active
* sort_order
* created_at
* updated_at

Option types:

* size
* flavor
* add_on

---

## 9.6 branch_product_availability

Stores product availability per branch.

Fields:

* id
* branch_id
* product_id
* is_available
* updated_at

---

## 9.7 deals

Stores app-exclusive deals.

Fields:

* id
* title
* description
* image_url
* deal_type
* discount_value
* minimum_order_amount
* start_at
* end_at
* usage_limit_per_user
* total_usage_limit
* is_active
* created_at
* updated_at

Deal types:

* percentage_discount
* fixed_discount
* buy_one_take_one
* free_item
* free_upgrade
* bundle

---

## 9.8 deal_products

Maps deals to eligible products.

Fields:

* id
* deal_id
* product_id

---

## 9.9 deal_branches

Maps deals to eligible branches.

Fields:

* id
* deal_id
* branch_id

---

## 9.10 coupons

Stores user-specific coupons.

Fields:

* id
* user_id
* deal_id
* reward_id
* code
* status
* expires_at
* used_at
* created_at

Statuses:

* available
* used
* expired

---

## 9.11 orders

Stores pickup orders.

Fields:

* id
* user_id
* branch_id
* order_number
* status
* subtotal
* discount_total
* total
* payment_method
* payment_status
* estimated_ready_at
* placed_at
* accepted_at
* ready_at
* completed_at
* cancelled_at
* created_at
* updated_at

Statuses:

* pending
* accepted
* preparing
* flavoring
* ready
* completed
* cancelled

Payment methods:

* pay_at_branch
* online_payment

Payment statuses:

* unpaid
* paid
* failed
* refunded

---

## 9.12 order_items

Stores items inside each order.

Fields:

* id
* order_id
* product_id
* product_name_snapshot
* quantity
* unit_price
* total_price
* selected_options
* created_at

---

## 9.13 rewards

Stores reward configuration.

Fields:

* id
* name
* required_stars
* reward_type
* reward_value
* eligible_product_id
* is_active
* created_at
* updated_at

---

## 9.14 user_stars

Stores user reward progress.

Fields:

* id
* user_id
* current_stars
* lifetime_stars
* updated_at

---

## 9.15 star_transactions

Stores star earning and redemption history.

Fields:

* id
* user_id
* order_id
* type
* stars
* description
* created_at

Types:

* earned
* redeemed
* adjusted
* expired

---

## 9.16 notifications

Stores notification history.

Fields:

* id
* user_id
* title
* body
* type
* target_screen
* read_at
* created_at

---

## 10. Technical Architecture

The project already uses:

* Expo React Native
* Turborepo monorepo
* CSS tokens and variables copied from the website
* Initial Home page setup

Recommended monorepo structure:

```txt
apps/
  mobile/
    app/
    src/
      components/
      features/
      screens/
      services/
      hooks/
      stores/
  staff-dashboard/
  admin-dashboard/

packages/
  ui/
  tokens/
  config/
  types/
  api/
  validators/
  utils/
```

### Recommended Package Responsibilities

#### apps/mobile

Customer-facing Expo React Native app.

Contains:

* Navigation
* Screens
* Mobile-specific components
* Push notification setup
* Local state
* Cart logic
* Customer order flow

#### apps/staff-dashboard

Branch staff dashboard.

Contains:

* Staff login
* Active orders
* Order status management
* Branch availability controls

#### apps/admin-dashboard

Admin dashboard.

Contains:

* Branch management
* Product management
* Deal management
* Rewards configuration
* Customer/order analytics

#### packages/ui

Shared components.

Examples:

* Button
* Card
* Badge
* Input
* ProductCard
* DealCard
* BranchCard
* RewardProgress
* OrderStatusBadge

#### packages/tokens

Shared design tokens copied from the website.

Examples:

* Colors
* Spacing
* Radius
* Typography
* Shadows

#### packages/types

Shared TypeScript types.

Examples:

* User
* Branch
* Product
* Deal
* Coupon
* Order
* Reward

#### packages/api

Shared API client.

Examples:

* getBranches
* getProducts
* createOrder
* updateOrderStatus
* getDeals
* getRewards

#### packages/validators

Shared schema validation.

Use for:

* Product forms
* Deal forms
* Checkout validation
* Order status updates

---

## 11. Recommended Mobile App Feature Folder Structure

```txt
apps/mobile/src/features/
  auth/
    screens/
    components/
    hooks/
    services/

  home/
    screens/
    components/

  branches/
    screens/
    components/
    hooks/

  menu/
    screens/
    components/
    hooks/

  cart/
    screens/
    components/
    store/

  checkout/
    screens/
    components/
    services/

  orders/
    screens/
    components/
    hooks/

  rewards/
    screens/
    components/
    services/

  deals/
    screens/
    components/

  account/
    screens/
    components/
```

---

## 12. Design Requirements

The app should reuse Jojo Potato website tokens.

### Visual Direction

* Fun
* Snackable
* Youthful
* Bright
* Easy to understand
* Promo-driven
* Not too corporate
* Not overly complex

**Typography / display-heading tone (amended 20-07-26):** display headings use a
clean, confident, grown-up sans (Plus Jakarta Sans ExtraBold) rather than a
rounded/cartoon display face. The intent is a more professional, mature heading
voice that still sits comfortably alongside the youthful, promo-driven,
snackable product character above — the two are complementary, not in tension:
the palette, imagery, and promo energy stay bright and playful while the
typographic voice reads as trustworthy and modern.

### UI Principles

* Big deal cards
* Clear CTAs
* Visual reward progress
* Minimal checkout steps
* Large product photos
* Friendly status labels
* Strong empty states
* Fast reorder actions

### Important Components

* DealCard
* BranchCard
* ProductCard
* RewardProgressCard
* StarProgressBar
* OrderStatusTimeline
* CouponCard
* CartItem
* FlavorSelector
* SizeSelector
* PickupTimeBadge

---

## 13. Analytics Events

Track the following events from day one.

### Acquisition

* app_opened
* onboarding_started
* onboarding_completed
* signup_started
* signup_completed
* location_permission_requested
* location_permission_granted
* location_permission_denied

### Branch

* branch_list_viewed
* branch_selected
* directions_opened
* pickup_branch_changed

### Deals

* deal_viewed
* deal_applied
* deal_removed
* deal_redeemed
* deal_expired_viewed

### Menu

* menu_viewed
* product_viewed
* product_added_to_cart
* flavor_selected
* size_selected

### Cart and Checkout

* cart_viewed
* checkout_started
* order_placed
* order_failed
* coupon_applied
* coupon_failed

### Orders

* order_status_viewed
* order_accepted
* order_preparing
* order_ready
* order_completed
* order_cancelled
* reorder_clicked

### Rewards

* rewards_viewed
* star_earned
* reward_unlocked
* reward_redeemed

---

## 14. Push Notification Requirements

### Transactional Notifications

* Your order was accepted.
* Your order is being prepared.
* Your order is ready for pickup.
* Your order was cancelled.

### Retention Notifications

* New app-only deal available.
* Your coupon expires soon.
* You are one order away from a free reward.
* You unlocked a reward.
* Weekend snack deal is live.

### Rules

* Transactional notifications should be allowed after user places order.
* Marketing notifications require user opt-in.
* Notifications should deep link into the correct screen.

---

## 15. MVP Success Metrics

### Activation Metrics

* App installs
* Signup conversion rate
* First order conversion rate
* First deal redemption rate

### Engagement Metrics

* Weekly active users
* Deal views
* Reward screen views
* Branch locator usage
* Reorder rate

### Revenue Metrics

* Pickup orders per branch
* Average order value
* Orders using deals
* Orders without deals
* Repeat purchase rate

### Loyalty Metrics

* Stars earned
* Rewards unlocked
* Rewards redeemed
* Customers with 2+ orders
* Customers with 5+ orders

### Operational Metrics

* Average order prep time
* Order acceptance time
* Cancelled pickup orders
* Ready-to-pickup delay
* Staff status update compliance

---

## 16. MVP Release Phases

## Phase 0: Foundation

* Finalize app navigation
* Finalize shared tokens
* Set up shared UI components
* Set up auth
* Set up backend schema
* Set up branch/product/deal seed data
* Set up app environment configs

## Phase 1: Customer App Core

* Home screen
* Branch locator
* Menu browsing
* Product details
* Cart
* Checkout
* Order confirmation
* Order history

## Phase 2: Deals and Rewards

* Deals list
* Deal details
* Coupon wallet
* Apply coupon to cart
* Jojo Stars progress
* Reward unlocking
* Reward redemption

## Phase 3: Pickup Live Updates

* Staff order dashboard
* Order status updates
* Customer order tracking
* Push notifications
* Pickup code / order number

## Phase 4: Admin Tools

* Branch management
* Product management
* Deal management
* Rewards configuration
* Basic analytics

## Phase 5: QA and Launch Prep

* Test customer order flow
* Test staff order status flow
* Test branch open/closed logic
* Test deal eligibility
* Test reward earning
* Test reward redemption
* Test push notifications
* Test no-location fallback
* Test unavailable product behavior

---

## 17. Edge Cases

### Branch Edge Cases

* Branch is closed
* Branch stops accepting pickup
* Branch has no available products
* User selected branch but it becomes unavailable
* User denies location permission

### Product Edge Cases

* Product becomes unavailable while in cart
* Product price changes before checkout
* Product has missing image
* Product has required flavor but none selected

### Deal Edge Cases

* Deal expires while in cart
* Deal usage limit is reached
* User already used first-order deal
* Deal is not valid for selected branch
* Deal is not valid for selected product

### Order Edge Cases

* Staff rejects order
* Staff cancels order
* Customer does not pick up order
* Order status update fails
* App closes after order placement
* User opens app with active order

### Reward Edge Cases

* Cancelled order should not earn stars
* Reward coupon expires
* User tries to redeem used coupon
* User reaches reward threshold after order completion
* Stars should not duplicate if order completion event is retried

---

## 18. Permissions

### Customer App

Required:

* Push notifications

Optional:

* Location permission

Location should be optional. The app should still work without it.

### Staff Dashboard

Required:

* Staff login
* Branch assignment
* Order access permission

### Admin Dashboard

Required:

* Admin login
* Role-based access

---

## 19. Security and Access Rules

### Customer

Can:

* View active branches
* View active products
* View active deals
* Create own orders
* View own orders
* View own rewards
* View own coupons

Cannot:

* View other customers
* Edit order status
* Modify deals
* Modify branches
* Modify products

### Staff

Can:

* View assigned branch orders
* Update assigned branch order status
* Update assigned branch product availability
* Pause pickup for assigned branch

Cannot:

* View other branch orders unless allowed
* Create global deals
* Modify reward rules
* View sensitive customer data beyond order needs

### Admin

Can:

* Manage branches
* Manage products
* Manage deals
* Manage rewards
* View customers
* View orders
* View analytics

---

## 20. Launch Criteria

The MVP is ready to launch when:

* Customer can sign up/login.
* Customer can select branch.
* Customer can browse menu.
* Customer can add products to cart.
* Customer can place pickup order.
* Staff can accept and update order.
* Customer can track order status.
* Customer receives ready-for-pickup notification.
* Customer earns stars after completed order.
* Customer can unlock and redeem reward.
* Admin can manage branches, products, deals, and rewards.
* Branch closed/unavailable states are handled.
* At least 10 test orders pass from start to completion.
* App works on iOS first.
* Android does not block the shared codebase.

---

## 21. Recommended MVP Build Priority

Build in this order:

1. App navigation and shared UI components
2. Auth
3. Branch locator
4. Menu and product details
5. Cart
6. Pickup checkout
7. Staff order dashboard
8. Live order status
9. Deals
10. Jojo Stars rewards
11. Push notifications
12. Admin management tools
13. Analytics
14. QA and launch polish

---

## 22. Suggested First Version Summary

The first public MVP should include:

* Customer login
* Branch locator
* Menu browsing
* Flavor and size selection
* Pickup cart and checkout
* Live pickup order status
* Staff order dashboard
* App-exclusive deals
* Coupon wallet
* Jojo Stars reward progress
* Reward redemption
* Push notifications
* Basic admin dashboard

The MVP should feel simple, fast, and promo-driven.

The core value proposition:

> Order Jojo Potato faster, unlock app-only deals, and earn free snacks every time you come back.
