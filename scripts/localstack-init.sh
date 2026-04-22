#!/bin/bash
set -e

echo "Initializing LocalStack S3..."
awslocal s3 mb s3://test-bucket --region eu-central-1
awslocal s3 mb s3://my-nestjs-bucket --region eu-central-1
echo "Buckets 'test-bucket' and 'my-nestjs-bucket' created."
