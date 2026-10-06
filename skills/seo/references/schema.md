# Schema types per page

JSON-LD through the framework's metadata or head API. Describe only what is visible on the page;
one `@id` for the organisation, referenced from the other types.

| Page                    | Types                                                                                                    | Notes                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Every page (layout)     | `Organization`, or a `LocalBusiness` subtype for a business with an address or service area, + `WebSite` | name, url, logo, phone, address, `areaServed`; `sameAs` only for real profiles                         |
| Service page            | `Service` + `BreadcrumbList`                                                                             | `provider` → the organisation `@id`, `areaServed`, `serviceType`                                       |
| Product with real specs | `Product`, `Offer` only with a real price                                                                | not for a category page                                                                                |
| Project or case         | `Article` + `BreadcrumbList`                                                                             | date and place in the text too                                                                         |
| Article                 | `Article` or `BlogPosting`                                                                               | `author`, `datePublished`, `dateModified`                                                              |
| FAQ block               | `FAQPage`                                                                                                | for AI readability only: Google shows FAQ rich results only for well-known government and health sites |

Never:

- Review stars (`AggregateRating`, `Review`) on the business's own `Organization` or
  `LocalBusiness`: Google's review snippet guidelines make reviews an entity controls about
  itself ineligible.
- Promise a rich result to the client. Structured data makes a page eligible, not shown.
