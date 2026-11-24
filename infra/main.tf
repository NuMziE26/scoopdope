terraform {
  required_version = ">= 1.0"

  backend "s3" {
    bucket         = "REPLACE_WITH_STATE_BUCKET"
    key            = "infra/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
