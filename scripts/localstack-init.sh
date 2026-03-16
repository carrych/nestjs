#!/bin/bash
set -e

echo "Initializing LocalStack S3..."
awslocal s3 mb s3://test-bucket --region eu-central-1
echo "Bucket 'test-bucket' created."
