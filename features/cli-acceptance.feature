Feature: CLI runs against different MongoDB versions and configurations
  As a developer or automated system
  I want to run mongo-schema-fetch against various versions and configurations of MongoDB
  So that I can verify compatibility and correctness of the extracted schema

  Scenario Outline: Fetch schema from MongoDB <version> in <config> configuration
    Given a running MongoDB "<version>" container in "<config>" configuration
    And the database has collection "users" with documents:
      | name    | age | role  |
      | Alice   | 30  | admin |
      | Bob     | 25  | user  |
      | Charlie | 35  | user  |
    When I run mongo-schema-fetch with "--all-collections --store-values" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "role" in "users" should have enum values "admin" and "user"
    And the field "role" in "users" should not leak any values
    And the output payload should have buildInfo version matching "<version>"

    Examples:
      | version   | config      |
      | mongo:5.0 | standalone  |
      | mongo:6.0 | standalone  |
      | mongo:7.0 | standalone  |
      | mongo:8.0 | standalone  |
      | mongo:7.0 | auth        |

  Scenario: Fetch schema from MongoDB with secondaryPreferred read preference
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with "--read-preference secondaryPreferred --all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario Outline: Fetch schema from MongoDB replica set cluster
    Given a running MongoDB "<version>" replica set cluster container
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
      | Bob   | 25  | user  |
    When I run mongo-schema-fetch with "--all-collections --store-values" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "role" in "users" should have enum values "admin" and "user"
    And the output payload should have buildInfo version matching "<version>"

    Examples:
      | version   |
      | mongo:6.0 |
      | mongo:7.0 |
      | mongo:8.0 |

  Scenario: Fetch schema from authenticated MongoDB using command-line username and password arguments
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username and password parameters and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB fails if wrong username and password parameters are provided
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with wrong username and password parameters and quiet mode
    Then the exit code should be 1

  Scenario: Fetch schema from TLS-enabled MongoDB using TLS options and CA verification
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and CA verification and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB using TLS mutual authentication
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and mutual authentication and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB fails if CA verification is required but not provided
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS but no CA verification and quiet mode
    Then the exit code should be 1

  Scenario: Fetch schema from TLS-enabled MongoDB succeeds if invalid CA verification is bypassed
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and invalid CA verification bypassed and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB succeeds if mismatching hostname is bypassed
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and mismatching hostname allowed and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using custom authSource and authMechanism arguments
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username, password, authSource, and authMechanism parameters and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB using password-encrypted client certificate
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS, mutual authentication, and encrypted client certificate password and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using password from environment variable
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username parameter and password in environment and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using all extended connection options
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with all extended connection options and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB using MONGODB-X509 authentication
    Given a running MongoDB container with TLS and MONGODB-X509 auth enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and MONGODB-X509 authentication and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using explicit SCRAM-SHA-1 authMechanism
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username, password, authSource, and SCRAM-SHA-1 authMechanism parameters and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using password from MONGODB_PASS environment variable
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username parameter and password in MONGODB_PASS environment and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema targeting a specific collection
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    And the database has collection "orders" with documents:
      | total | status    |
      | 100   | completed |
    When I run mongo-schema-fetch with "--collections users" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the output payload should not contain collection "orders"

  Scenario: Fetch schema with negated connection options
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username, password, and negated connection parameters and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema fails if direct connection is disabled on single-node replica set
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username, password, and disabled direct connection and quiet mode
    Then the exit code should be 1

  Scenario: Auto-analyze passes when query is optimized
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age |
      | Alice | 30  |
    And a query file "query-ok.json" containing "db.users.find({ name: 'Alice' })"
    When I run mongo-schema-fetch with "--all-collections --query-file query-ok.json --auto-analyze" and quiet mode
    Then the exit code should be 0

  Scenario: Auto-analyze fails when query degrades performance
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age |
      | Alice | 30  |
    And a query file "query-fail.json" containing "db.users.find({ name: 'fail_test' })"
    When I run mongo-schema-fetch with "--all-collections --query-file query-fail.json --auto-analyze" and quiet mode
    Then the exit code should be 1

  Scenario: Fetch schema with customized stored values limit and PII sanitization
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | email             | age | role  |
      | alice@example.com | 30  | admin |
      | bob@example.com   | 25  | user  |
    When I run mongo-schema-fetch with "--store-values --stored-values-limit 1 --distinct-fields-threshold 50 --sanitize-pii --all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "email" in "users" should not leak any values

  Scenario: CLI fails if distinct fields threshold is exceeded
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age |
      | Alice | 30  |
    When I run mongo-schema-fetch with "--all-collections --distinct-fields-threshold 1" and quiet mode
    Then the exit code should be 1

  Scenario: Fetch schema fails if load balanced option is enabled on standalone connection
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    When I run mongo-schema-fetch with "--load-balanced --all-collections" and quiet mode
    Then the exit code should be 1

  Scenario: Auto-analyze fails if query-file is not provided
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    When I run mongo-schema-fetch with "--all-collections --auto-analyze" and quiet mode
    Then the exit code should be 1

  Scenario: Fetch schema targeting a non-existent collection
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with "--collections users,nonexistent" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the output payload should not contain collection "nonexistent"

  Scenario: Fetch schema with store-values and stored-values-limit
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
      | Bob   | 25  | user  |
    When I run mongo-schema-fetch with "--store-values --stored-values-limit 1 --all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "role" in "users" should only contain enum values of length at most 1


  Scenario: Fetch schema with enum-threshold below unique values count
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
      | Bob   | 25  | user  |
    When I run mongo-schema-fetch with "--store-values --enum-threshold 2 --all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "role" in "users" should have no enum values

  Scenario: Fetch schema with sanitize-pii removes enum values for sensitive fields
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | email             | age | role  |
      | alice@example.com | 30  | admin |
      | bob@example.com   | 25  | user  |
    When I run mongo-schema-fetch with "--store-values --sanitize-pii --all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "email" in "users" should have no enum values

  Scenario: Validate wrong format connection URI fails
    When I run mongo-schema-fetch with raw parameters "invalid-uri --all-collections"
    Then the exit code should be 1
    And the error output should contain "Error: Invalid MongoDB connection URI"

  Scenario: Validate invalid sample size parameter fails
    When I run mongo-schema-fetch with parameters "mongodb://localhost:27017/db --sample abc --all-collections"
    Then the exit code should be 1
    And the error output should contain "Error: --sample must be a positive integer"

  Scenario: Validate empty query string fails
    When I run mongo-schema-fetch with parameters "mongodb://localhost:27017/db --server localhost:3000 --query ''"
    Then the exit code should be 1
    And the error output should contain "Query is empty"

  Scenario: Validate invalid mongosh query format fails
    When I run mongo-schema-fetch with parameters "mongodb://localhost:27017/db --server localhost:3000 --query 'db.users.find({'"
    Then the exit code should be 1
    And the error output should contain "Invalid query format"

  Scenario: Validate empty query file fails
    Given a query file "query-empty.json" containing ""
    When I run mongo-schema-fetch with parameters "mongodb://localhost:27017/db --query-file query-empty.json --all-collections"
    Then the exit code should be 1
    And the error output should contain "Error: Query file is empty"

  Scenario: Validate valid mongosh query with BSON constructors is parsed successfully
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age |
      | Alice | 30  |
    When I run mongo-schema-fetch with parameters "--query 'db.users.find({ id: ObjectId(\"507f1f77bcf86cd799439011\"), date: ISODate(\"2026-06-20T23:56:37Z\") })' --all-collections"
    Then the exit code should be 0



