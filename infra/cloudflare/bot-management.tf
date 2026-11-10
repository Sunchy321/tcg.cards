# Bot Fight Mode challenges detected bots across the entire zone on the Free plan.
resource "cloudflare_bot_management" "bot_fight_mode" {
  zone_id    = var.cloudflare_zone_id
  enable_js  = true
  fight_mode = true

  ai_training = "block"
  aisearch    = "block"
  ai_user     = "block"
}
