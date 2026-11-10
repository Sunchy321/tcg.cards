terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28.1"
    }
  }
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for tcg.cards."
  type        = string
}

# Import the existing rate limiting ruleset and preserve its rules if this zone already has one.
resource "cloudflare_ruleset" "rate_limits" {
  zone_id = var.cloudflare_zone_id
  name    = "Rate limits for tcg.cards"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules = [{
    ref         = "hearthstone_card_data_per_ip"
    description = "Limit requests to Hearthstone card data endpoints"
    expression  = "http.request.uri.path in {\"/api/hearthstone/card\" \"/api/hearthstone/card/\" \"/api/hearthstone/render-model\" \"/api/hearthstone/render-model/\"}"
    action      = "block"
    enabled     = true

    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 5
      mitigation_timeout  = 10
    }
  }]
}
