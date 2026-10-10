DOCKER_USERNAME ?=
IMAGE_TAG ?= dev
PLATFORMS ?= linux/amd64,linux/arm64
IMAGE_ARCHIVE ?= applaunchpad.tar

ifneq ($(strip $(DOCKER_USERNAME)),)
  imageOwner := $(DOCKER_USERNAME)/
else
  imageOwner :=
endif
IMAGE ?= $(imageOwner)sealos-applaunchpad:$(IMAGE_TAG)

.PHONY: all push-images fetch-deps build-packages build-providers/applaunchpad dev-providers/applaunchpad image-build-providers/applaunchpad image-push-providers/applaunchpad

all: image-build-providers/applaunchpad
push-images: image-push-providers/applaunchpad

fetch-deps: pnpm-lock.yaml
	pnpm fetch

build-packages: fetch-deps
	pnpm -r --offline --filter='./packages/*' install
	pnpm -r --filter='./packages/*' run build

build-providers/applaunchpad: build-packages
	pnpm --offline --filter=applaunchpad install
	pnpm --filter=applaunchpad run build

dev-providers/applaunchpad: build-packages
	pnpm --offline --filter=applaunchpad install
	pnpm --filter=applaunchpad run dev

image-build-providers/applaunchpad:
	docker buildx build --platform=$(PLATFORMS) -t $(IMAGE) --output=type=oci,dest=$(IMAGE_ARCHIVE) .

image-push-providers/applaunchpad:
	docker buildx build --platform=$(PLATFORMS) -t $(IMAGE) --push .
